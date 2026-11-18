// Interview lists and the views thread cards hydrate.
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import type {
  HostInterviewView,
  InterviewFormat,
  InterviewItem,
  InterviewSlotView,
  InterviewStatus,
  InterviewWhere,
  Page,
  ScanState,
  SeekerInterviewItem,
} from '@/lib/hiring';
import type { HostContext } from '@/server/guards';
import { getHostCards } from '@/modules/applications';
import { getHiringInfoMany } from '@/modules/listings';
import { listingScope } from '@/modules/messaging';
import { getOrgSummaries } from '@/modules/orgs';
import { interviewSlots, interviews, pipelineEntries } from '../schema';

type InterviewRow = typeof interviews.$inferSelect;

const PAGE = 25;
const VISIBLE: ScanState[] = ['clear', 'warn'];

export type InterviewBundle = {
  view: HostInterviewView;
  orgId: string;
  listingId: string;
  seekerUserId: string;
  threadId: string;
  scanState: ScanState;
};

function whereOf(row: InterviewRow): InterviewWhere {
  if (row.format === 'video') return { kind: 'video', url: row.videoUrl ?? '' };
  if (row.format === 'in_person') return { kind: 'in_person', address: row.address ?? '' };
  return { kind: 'phone', note: row.phoneNote };
}

function windowsOf(value: unknown): { start: string; end: string }[] | null {
  if (!Array.isArray(value)) return null;
  const out: { start: string; end: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const start = 'start' in item && typeof item.start === 'string' ? item.start : null;
    const end = 'end' in item && typeof item.end === 'string' ? item.end : null;
    if (!start || !end) return null;
    out.push({ start, end });
  }
  return out;
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

function slotsOf(
  rows: (typeof interviewSlots.$inferSelect)[],
  round: number,
  now: Date,
): InterviewSlotView[] {
  return rows
    .filter((slot) => slot.round === round)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((slot) => ({
      id: slot.id,
      round: slot.round,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      passed: slot.startsAt.getTime() <= now.getTime(),
    }));
}

export function toHostView(
  row: InterviewRow,
  slots: (typeof interviewSlots.$inferSelect)[],
  now: Date,
): HostInterviewView {
  return {
    id: row.id,
    applicationId: row.applicationId,
    status: row.status as InterviewStatus,
    format: row.format as InterviewFormat,
    where: whereOf(row),
    round: row.round,
    slots: slotsOf(slots, row.round, now),
    durationMinutes: row.durationMinutes,
    timezone: row.timezone,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    scheduledStart: row.scheduledStart ? row.scheduledStart.toISOString() : null,
    scheduledEnd: row.scheduledEnd ? row.scheduledEnd.toISOString() : null,
    requestedWindows: windowsOf(row.requestedWindows),
    requestNote: row.requestNote,
    note: row.note,
    noteState: row.scanState as ScanState,
    organizerUserId: row.organizerUserId,
  };
}

export function toSeekerItem(
  view: HostInterviewView,
  extra: { orgName: string; title: string; threadId: string },
): SeekerInterviewItem {
  const { noteState: _noteState, organizerUserId: _organizer, status, ...rest } = view;
  return {
    ...rest,
    status: status === 'completed' || status === 'no_show' ? 'past' : status,
    orgName: extra.orgName,
    title: extra.title,
    threadId: extra.threadId,
  };
}

export function needsAction(row: InterviewRow, now: Date): boolean {
  if (row.status === 'reschedule_requested') return true;
  return (
    row.status === 'scheduled' &&
    row.scheduledEnd !== null &&
    row.scheduledEnd.getTime() <= now.getTime() &&
    row.outcomeAt === null
  );
}

async function slotsByInterview(db: DbOrTx, ids: string[]) {
  const map = new Map<string, (typeof interviewSlots.$inferSelect)[]>();
  if (ids.length === 0) return map;
  const rows = await db.select().from(interviewSlots).where(inArray(interviewSlots.interviewId, ids));
  for (const row of rows) {
    const list = map.get(row.interviewId) ?? [];
    list.push(row);
    map.set(row.interviewId, list);
  }
  return map;
}

export async function interviewBundles(
  db: DbOrTx,
  ids: string[],
  now = new Date(),
): Promise<Map<string, InterviewBundle>> {
  const out = new Map<string, InterviewBundle>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ interview: interviews, seekerUserId: pipelineEntries.seekerUserId })
    .from(interviews)
    .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
    .where(inArray(interviews.id, ids));
  const slots = await slotsByInterview(
    db,
    rows.map((row) => row.interview.id),
  );
  for (const row of rows) {
    out.set(row.interview.id, {
      view: toHostView(row.interview, slots.get(row.interview.id) ?? [], now),
      orgId: row.interview.orgId,
      listingId: row.interview.listingId,
      seekerUserId: row.seekerUserId,
      threadId: row.interview.threadId,
      scanState: row.interview.scanState as ScanState,
    });
  }
  return out;
}

export async function hostInterviewViews(
  db: DbOrTx,
  ids: string[],
  now = new Date(),
): Promise<Map<string, HostInterviewView>> {
  const bundles = await interviewBundles(db, ids, now);
  return new Map([...bundles].map(([id, bundle]) => [id, bundle.view]));
}

export async function seekerInterviewViews(
  db: DbOrTx,
  seekerUserId: string,
  ids: string[],
  now = new Date(),
): Promise<Map<string, SeekerInterviewItem>> {
  const bundles = await interviewBundles(db, ids, now);
  const visible = [...bundles.values()].filter(
    (bundle) => bundle.seekerUserId === seekerUserId && VISIBLE.includes(bundle.scanState),
  );
  const listingIds = [...new Set(visible.map((bundle) => bundle.listingId))];
  const orgIds = [...new Set(visible.map((bundle) => bundle.orgId))];
  const infos = await getHiringInfoMany(db, listingIds);
  const titles = new Map(infos.map((info) => [info.id, info.title]));
  const orgs = await getOrgSummaries(db, orgIds);
  const out = new Map<string, SeekerInterviewItem>();
  for (const bundle of visible) {
    out.set(
      bundle.view.id,
      toSeekerItem(bundle.view, {
        orgName: orgs.get(bundle.orgId)?.name ?? 'Org',
        title: titles.get(bundle.listingId) ?? '',
        threadId: bundle.threadId,
      }),
    );
  }
  return out;
}

export async function listSeekerInterviews(
  db: DbOrTx,
  seekerUserId: string,
  o?: { cursor?: string; now?: Date },
): Promise<Page<SeekerInterviewItem>> {
  const now = o?.now ?? new Date();
  const filters = [
    eq(pipelineEntries.seekerUserId, seekerUserId),
    inArray(interviews.scanState, VISIBLE),
  ];
  if (o?.cursor) {
    const cursor = decodeCursor(o.cursor);
    if (!cursor) throw badRequest('That page link is not valid.');
    const older = or(
      lt(interviews.createdAt, cursor.at),
      and(eq(interviews.createdAt, cursor.at), lt(interviews.id, cursor.id)),
    );
    if (older) filters.push(older);
  }
  const rows = await db
    .select({ interview: interviews })
    .from(interviews)
    .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
    .where(and(...filters))
    .orderBy(desc(interviews.createdAt), desc(interviews.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const views = await seekerInterviewViews(
    db,
    seekerUserId,
    page.map((row) => row.interview.id),
    now,
  );
  const items = page.flatMap((row) => {
    const item = views.get(row.interview.id);
    return item ? [item] : [];
  });
  const last = page.at(-1)?.interview;
  const nextCursor = rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

export async function listHostInterviews(
  db: DbOrTx,
  ctx: HostContext,
  q: { from: string; to: string; listingId?: string; needsAction?: boolean },
  now = new Date(),
): Promise<{ items: InterviewItem[] }> {
  const from = new Date(q.from);
  const to = new Date(q.to);
  const scope = await listingScope(db, ctx);
  if (!scope.all && scope.listingIds.length === 0) return { items: [] };
  const filters = [
    eq(interviews.orgId, ctx.orgId),
    or(
      and(isNotNull(interviews.scheduledStart), gte(interviews.scheduledStart, from), lt(interviews.scheduledStart, to)),
      and(isNull(interviews.scheduledStart), isNotNull(interviews.expiresAt), gte(interviews.expiresAt, from), lt(interviews.expiresAt, to)),
      and(eq(interviews.status, 'reschedule_requested'), isNull(interviews.scheduledStart), isNull(interviews.expiresAt)),
    ) ?? eq(interviews.orgId, ctx.orgId),
  ];
  if (!scope.all) filters.push(inArray(interviews.listingId, scope.listingIds));
  if (q.listingId) filters.push(eq(interviews.listingId, q.listingId));
  if (q.needsAction) {
    const actionable = or(
      eq(interviews.status, 'reschedule_requested'),
      and(eq(interviews.status, 'scheduled'), isNotNull(interviews.scheduledEnd), lte(interviews.scheduledEnd, now), isNull(interviews.outcomeAt)),
    );
    if (actionable) filters.push(actionable);
  }
  const rows = await db
    .select()
    .from(interviews)
    .where(and(...filters))
    .orderBy(desc(interviews.scheduledStart), desc(interviews.createdAt));
  if (rows.length === 0) return { items: [] };
  const applicationIds = [...new Set(rows.map((row) => row.applicationId))];
  const listingIds = [...new Set(rows.map((row) => row.listingId))];
  const [cards, infos] = await Promise.all([
    getHostCards(db, { orgId: ctx.orgId, applicationIds }),
    getHiringInfoMany(db, listingIds),
  ]);
  const names = new Map(cards.map((card) => [card.applicationId, card]));
  const titles = new Map(infos.map((info) => [info.id, info.title]));
  const items: InterviewItem[] = rows.map((row) => ({
    interviewId: row.id,
    applicationId: row.applicationId,
    listingId: row.listingId,
    listingTitle: titles.get(row.listingId) ?? '',
    firstName: names.get(row.applicationId)?.firstName ?? '',
    lastName: names.get(row.applicationId)?.lastName ?? '',
    status: row.status as InterviewStatus,
    format: row.format as InterviewFormat,
    round: row.round,
    scheduledStart: row.scheduledStart ? row.scheduledStart.toISOString() : null,
    scheduledEnd: row.scheduledEnd ? row.scheduledEnd.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    timezone: row.timezone,
    needsAction: needsAction(row, now),
    threadId: row.threadId,
  }));
  return { items };
}
