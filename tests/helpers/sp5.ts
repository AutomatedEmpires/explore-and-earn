// Rows and envelopes for SP5 tests. Seed helpers insert the W0 tables directly.
import type { ApplicationStatus } from '@/lib/applications';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { interviewSlots, interviews, invites, offers, pipelineEntries, threads } from '@/db/schema';
import type { EventEnvelope } from '@/modules/jobs';
import type { EventPayloads } from '@/server/event-subscribers';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { FIXED_NOW, seedHostOrg, seedMedia, seedMember, seedSeeker } from './sp2';

export { FIXED_NOW, seedHostOrg, seedMedia, seedMember, seedSeeker };

const HOUR = 60 * 60 * 1000;

export async function seedEntry(
  db: DbOrTx,
  i: {
    orgId: string;
    listingId: string;
    seekerUserId: string;
    locationId?: string | null;
    status?: ApplicationStatus;
    source?: string;
    appliedAt?: Date;
    fitScore?: number | null;
  },
): Promise<string> {
  const applicationId = newId();
  const at = i.appliedAt ?? FIXED_NOW;
  await db.insert(pipelineEntries).values({
    applicationId,
    orgId: i.orgId,
    listingId: i.listingId,
    locationId: i.locationId ?? null,
    seekerUserId: i.seekerUserId,
    status: i.status ?? 'new',
    source: i.source ?? 'seek',
    appliedAt: at,
    lastStatusAt: at,
    fitScore: i.fitScore ?? null,
  });
  applicationsFake.seedApplication({
    id: applicationId,
    orgId: i.orgId,
    seekerUserId: i.seekerUserId,
    listingId: i.listingId,
    status: i.status ?? 'new',
  });
  return applicationId;
}

export async function seedInvite(
  db: DbOrTx,
  i: {
    orgId: string;
    listingId: string;
    seekerUserId: string;
    sentBy: string;
    candidateId?: string;
    status?: 'sent' | 'interested' | 'applied' | 'not_interested' | 'expired';
    note?: string | null;
    scanState?: 'pending' | 'clear' | 'warn' | 'held';
    sentAt?: Date;
    expiresAt?: Date;
  },
): Promise<string> {
  const id = newId();
  const sentAt = i.sentAt ?? FIXED_NOW;
  await db.insert(invites).values({
    id,
    orgId: i.orgId,
    listingId: i.listingId,
    seekerUserId: i.seekerUserId,
    candidateId: i.candidateId ?? newId(),
    sentBy: i.sentBy,
    note: i.note ?? null,
    status: i.status ?? 'sent',
    scanState: i.scanState ?? 'clear',
    sentAt,
    expiresAt: i.expiresAt ?? new Date(sentAt.getTime() + 14 * 24 * HOUR),
  });
  return id;
}

export async function seedInterview(
  db: DbOrTx,
  i: {
    orgId: string;
    listingId: string;
    applicationId: string;
    threadId: string;
    organizerUserId: string;
    status?: 'invited' | 'scheduled' | 'reschedule_requested' | 'declined' | 'expired' | 'canceled' | 'completed' | 'no_show';
    slots?: { startsAt: Date; endsAt: Date; round?: number }[];
  },
): Promise<string> {
  const id = newId();
  const starts = i.slots?.[0]?.startsAt ?? FIXED_NOW;
  await db.insert(interviews).values({
    id,
    orgId: i.orgId,
    listingId: i.listingId,
    applicationId: i.applicationId,
    threadId: i.threadId,
    organizerUserId: i.organizerUserId,
    status: i.status ?? 'invited',
    format: 'phone',
    timezone: 'America/Denver',
    durationMinutes: 30,
    expiryHours: 72,
    round: 1,
    sequence: 0,
    expiresAt: new Date(starts.getTime() + 72 * HOUR),
    scanState: 'clear',
  });
  const slots = i.slots ?? [{ startsAt: starts, endsAt: new Date(starts.getTime() + 30 * 60 * 1000), round: 1 }];
  if (slots.length > 0) {
    await db.insert(interviewSlots).values(
      slots.map((slot) => ({
        id: newId(),
        interviewId: id,
        round: slot.round ?? 1,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      })),
    );
  }
  return id;
}

export async function seedOffer(
  db: DbOrTx,
  i: {
    orgId: string;
    listingId: string;
    applicationId: string;
    threadId: string;
    createdBy: string;
    position?: string;
    startDate?: string;
    payAmountCents?: number;
  },
): Promise<string> {
  const id = newId();
  await db.insert(offers).values({
    id,
    orgId: i.orgId,
    listingId: i.listingId,
    applicationId: i.applicationId,
    threadId: i.threadId,
    createdBy: i.createdBy,
    status: 'sent',
    position: i.position ?? 'Lift Operator',
    startDate: i.startDate ?? '2027-01-01',
    payAmountCents: i.payAmountCents ?? 2000,
    payUnit: 'hour',
    priorStatus: 'interviewing',
    scanState: 'clear',
  });
  return id;
}

export async function seedThread(
  db: DbOrTx,
  i: { orgId: string; listingId: string; seekerUserId: string; applicationId?: string | null },
): Promise<string> {
  const id = newId();
  await db.insert(threads).values({
    id,
    orgId: i.orgId,
    listingId: i.listingId,
    seekerUserId: i.seekerUserId,
    applicationId: i.applicationId ?? null,
  });
  return id;
}

/** An envelope in the shape `emit` writes onto the outbox. */
export function envelope<E extends keyof EventPayloads>(
  event: E,
  data: EventPayloads[E],
  eventId = '11111111-1111-4111-8111-111111111111',
): EventEnvelope<E> {
  return { event, eventId, data };
}
