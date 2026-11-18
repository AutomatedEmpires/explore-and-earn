// RFC 5545 calendar files for interviews. Times are UTC. No attendee lines.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { notFound } from '@/lib/errors';
import type { EmailAttachment, NotificationData } from '@/modules/notifications';
import { getHiringInfoMany } from '@/modules/listings';
import { inScope, listingScope, type ThreadViewer } from '@/modules/messaging';
import { getOrgSummaries } from '@/modules/orgs';
import { interviews, pipelineEntries } from '../schema';

export type IcsEvent = {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  location: string;
  description: string;
  organizerEmail: string;
};

const HIRING_ROLES = new Set(['owner', 'admin', 'recruiter']);

export function interviewUid(id: string): string {
  return `interview-${id}@${new URL(getEnv().APP_URL).host}`;
}

/** The address inside `EMAIL_FROM` (`Name <a@b>` or a bare address). */
export function organizerEmail(): string {
  const from = getEnv().EMAIL_FROM.trim();
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] ?? from).trim();
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function utcStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/** Fold at 75 octets. Continuation lines begin with a space, which counts toward the 75. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return `${line}\r\n`;
  const parts: string[] = [];
  let offset = 0;
  let width = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + width, bytes.length);
    while (end > offset && end < bytes.length) {
      const byte = bytes[end];
      if (byte === undefined || (byte & 0xc0) !== 0x80) break;
      end -= 1;
    }
    if (end === offset) end = Math.min(offset + width, bytes.length);
    const chunk = bytes.subarray(offset, end).toString('utf8');
    parts.push(offset === 0 ? chunk : ` ${chunk}`);
    offset = end;
    width = 74;
  }
  return `${parts.join('\r\n')}\r\n`;
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Explore&Earn//Interviews//EN',
    'VERSION:2.0',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${escapeText(e.uid)}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${utcStamp(e.stamp)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `ORGANIZER:mailto:${escapeText(e.organizerEmail)}`,
    `STATUS:${e.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('');
}

function appBase(): string {
  return getEnv().APP_URL.replace(/\/+$/, '');
}

export function threadUrl(audience: 'seeker' | 'host', threadId: string): string {
  const path = audience === 'host' ? `/host/messages/${threadId}` : `/inbox/${threadId}`;
  return `${appBase()}${path}`;
}

function locationOf(row: { format: string; address: string | null; videoUrl: string | null }): string {
  if (row.format === 'in_person') return row.address ?? '';
  if (row.format === 'video') return row.videoUrl ?? '';
  return 'Phone';
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export async function interviewIcsAttachments(
  d: NotificationData,
  db: DbOrTx,
): Promise<EmailAttachment[]> {
  if (typeof d.interviewId !== 'string') return [];
  const [row] = await db.select().from(interviews).where(eq(interviews.id, d.interviewId));
  if (!row || Number(d.sequence) !== row.sequence) return [];
  const method = d.icsMethod === 'CANCEL' ? 'CANCEL' : 'REQUEST';
  const start = row.scheduledStart ?? asDate(d.start);
  const end = row.scheduledEnd ?? asDate(d.end);
  if (!start || !end) return [];
  if (method === 'REQUEST' && !row.scheduledStart) return [];
  const [info] = await getHiringInfoMany(db, [row.listingId]);
  const orgs = await getOrgSummaries(db, [row.orgId]);
  const position = typeof d.position === 'string' && d.position.length > 0 ? d.position : (info?.title ?? '');
  const orgName = typeof d.orgName === 'string' && d.orgName.length > 0 ? d.orgName : (orgs.get(row.orgId)?.name ?? 'Org');
  const audience = d.audience === 'host' ? 'host' : 'seeker';
  const content = buildIcs({
    method,
    uid: interviewUid(row.id),
    sequence: row.sequence,
    start,
    end,
    stamp: row.updatedAt,
    summary: `Interview: ${position} at ${orgName}`,
    location: locationOf(row),
    description: threadUrl(audience, row.threadId),
    organizerEmail: organizerEmail(),
  });
  return [
    {
      filename: 'interview.ics',
      contentType: `text/calendar; method=${method}; charset=utf-8`,
      content,
    },
  ];
}

export async function getInterviewIcs(
  db: DbOrTx,
  viewer: ThreadViewer,
  interviewId: string,
): Promise<{ content: string; method: 'REQUEST' | 'CANCEL' }> {
  const [row] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
  if (!row) throw notFound('Interview not found', { reason: 'not_found' });
  const [entry] = await db
    .select()
    .from(pipelineEntries)
    .where(eq(pipelineEntries.applicationId, row.applicationId));
  if (!entry) throw notFound('Interview not found', { reason: 'not_found' });

  if (viewer.kind === 'seeker') {
    if (entry.seekerUserId !== viewer.userId) throw notFound('Interview not found', { reason: 'not_found' });
  } else {
    if (!HIRING_ROLES.has(viewer.ctx.role) || row.orgId !== viewer.ctx.orgId) {
      throw notFound('Interview not found', { reason: 'not_found' });
    }
    const scope = await listingScope(db, viewer.ctx);
    if (!inScope(scope, row.listingId)) throw notFound('Interview not found', { reason: 'not_found' });
  }

  const method = row.status === 'scheduled' ? 'REQUEST' : row.status === 'canceled' ? 'CANCEL' : null;
  if (!method || !row.scheduledStart || !row.scheduledEnd) {
    throw notFound('Interview not found', { reason: 'not_found' });
  }
  const audience = viewer.kind === 'host' ? 'host' : 'seeker';
  const [info] = await getHiringInfoMany(db, [row.listingId]);
  const orgs = await getOrgSummaries(db, [row.orgId]);
  const content = buildIcs({
    method,
    uid: interviewUid(row.id),
    sequence: row.sequence,
    start: row.scheduledStart,
    end: row.scheduledEnd,
    stamp: row.updatedAt,
    summary: `Interview: ${info?.title ?? ''} at ${orgs.get(row.orgId)?.name ?? 'Org'}`,
    location: locationOf(row),
    description: threadUrl(audience, row.threadId),
    organizerEmail: organizerEmail(),
  });
  return { content, method };
}
