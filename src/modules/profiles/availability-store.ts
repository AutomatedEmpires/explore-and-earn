// Stored availability and the reconfirmation sweep (SP4 spec 8.2). W0 stub: W1 implements it
// (Task 10).
import type { Db } from '@/lib/db';
import type { AvailabilityDto, AvailabilityInput } from '@/lib/profiles';

export async function setAvailability(
  _db: Db,
  _userId: string,
  _i: AvailabilityInput,
  _now?: Date,
): Promise<AvailabilityDto> {
  throw new Error('not implemented: setAvailability');
}

/** Confirming a past date switches it to `now`. */
export async function confirmAvailability(
  _db: Db,
  _userId: string,
  _i: { clientToday: string },
  _now?: Date,
): Promise<AvailabilityDto> {
  throw new Error('not implemented: confirmAvailability');
}

/** `profiles.availability_sweep` (daily): reminders at 30 and 60 days, stale at 90. */
export async function availabilitySweep(
  _db: Db,
  _now: Date,
): Promise<{ reminded: number; hidden: number }> {
  throw new Error('not implemented: availabilitySweep');
}
