// Stored availability and the reconfirmation sweep (SP4 spec 8.2).
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import {
  checkClientToday,
  confirmedDaysAgo,
  resolveAvailability,
  type AvailabilityDto,
  type AvailabilityInput,
} from '@/lib/profiles';
import { record } from '@/modules/audit';
import { notify } from '@/modules/notifications';
import { bumpProfile } from './profile';
import { seekerProfiles } from './schema';
import './notification-types';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

async function store(
  db: Db,
  userId: string,
  preset: NonNullable<AvailabilityDto>['preset'],
  date: string,
  now: Date,
): Promise<AvailabilityDto> {
  await db.transaction(async (tx) => {
    await bumpProfile(tx, userId, 'availability');
    await tx
      .update(seekerProfiles)
      .set({
        availPreset: preset,
        availDate: date,
        availConfirmedAt: now,
        availRemindersSent: 0,
      })
      .where(eq(seekerProfiles.userId, userId));
    await record(tx, {
      actorType: 'user',
      actorId: userId,
      action: 'profiles.availability_set',
      subjectType: 'seeker_profile',
      subjectId: userId,
      data: { fields: ['availability'] },
    });
  });
  return {
    preset,
    date,
    confirmedAt: now.toISOString(),
    confirmedDaysAgo: confirmedDaysAgo(now, now),
  };
}

export async function setAvailability(
  db: Db,
  userId: string,
  i: AvailabilityInput,
  now = new Date(),
): Promise<AvailabilityDto> {
  if (!checkClientToday(i.clientToday, now)) {
    throw badRequest('Your date is too far from today', { reason: 'client_today_skew' });
  }
  const resolved = resolveAvailability(i);
  if (!resolved.ok) throw badRequest('That start date does not work', { reason: resolved.reason });
  return store(db, userId, i.preset, resolved.date, now);
}

/** Confirming a past date switches it to `now`. */
export async function confirmAvailability(
  db: Db,
  userId: string,
  i: { clientToday: string },
  now = new Date(),
): Promise<AvailabilityDto> {
  if (!checkClientToday(i.clientToday, now)) {
    throw badRequest('Your date is too far from today', { reason: 'client_today_skew' });
  }
  const [row] = await db
    .select({
      preset: seekerProfiles.availPreset,
      date: seekerProfiles.availDate,
    })
    .from(seekerProfiles)
    .where(eq(seekerProfiles.userId, userId))
    .limit(1);
  if (!row?.preset || !row.date) throw badRequest('Set a start date first', { reason: 'date_required' });
  const stored = String(row.date).slice(0, 10);
  const past = stored < i.clientToday;
  return store(db, userId, past ? 'now' : row.preset, past ? i.clientToday : stored, now);
}

/** `profiles.availability_sweep` (daily): reminders at 30 and 60 days, stale at 90. */
export async function availabilitySweep(
  db: Db,
  now: Date,
): Promise<{ reminded: number; hidden: number }> {
  let reminded = 0;
  let hidden = 0;
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  for (;;) {
    const rows = await db
      .select({
        userId: seekerProfiles.userId,
        sent: seekerProfiles.availRemindersSent,
      })
      .from(seekerProfiles)
      .where(
        and(
          eq(seekerProfiles.visibleToHosts, true),
          isNull(seekerProfiles.removedByModerationAt),
          or(
            and(eq(seekerProfiles.availRemindersSent, 0), lte(seekerProfiles.availConfirmedAt, ago(30))),
            and(eq(seekerProfiles.availRemindersSent, 1), lte(seekerProfiles.availConfirmedAt, ago(60))),
            and(eq(seekerProfiles.availRemindersSent, 2), lte(seekerProfiles.availConfirmedAt, ago(90))),
          ),
        ),
      )
      .orderBy(seekerProfiles.userId)
      .limit(BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      const hide = row.sent >= 2;
      const type = hide ? 'profiles.availability_hidden' : 'profiles.availability_reconfirm';
      await notify(db, row.userId, type, { url: '/profile?sheet=availability' });
      await db
        .update(seekerProfiles)
        .set({ availRemindersSent: sql`${seekerProfiles.availRemindersSent} + 1` })
        .where(eq(seekerProfiles.userId, row.userId));
      if (hide) hidden += 1;
      else reminded += 1;
    }
    if (rows.length < BATCH) break;
  }
  return { reminded, hidden };
}
