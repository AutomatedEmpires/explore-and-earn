// Onboarding: a new user picks Seeker or Host once. The account type lives in app.users and is
// mirrored to Clerk's public metadata (read by the proxy from the session token). It is never
// changed afterwards, and `operator` can't be chosen: operators exist only by invitation.
//
// The age screen (legal review 2.6, P0 item 17): a seeker gives their date of birth as a neutral
// question. The server checks it and keeps only "18 or older: yes" (adult_attested_at) and the
// year. The full date is never stored, logged or sent anywhere. Someone under the cut-off is
// refused with a message that names no age, and nothing about them is saved.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, type Tx, withTx } from '@/lib/db';
import { AppError, badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
// The orgs barrel imports identity while it is still evaluating, so reading the name schema
// from the barrel leaves it undefined. The leaf file has no dependency on either module.
// eslint-disable-next-line no-restricted-imports
import { organizationNameSchema } from '@/modules/orgs/name';
import { createOrganization, findHostMembership } from '@/modules/orgs';
import type { ClerkAdmin } from './clerk-admin';
import { users } from './schema';

/** Seekers must be at least this old. Never shown or sent to the person (legal review 2.6). */
const ADULT_AGE = 18;

/** The earliest birth year the screen accepts. */
export const MIN_BIRTH_YEAR = 1900;

/** A calendar date, month and day counted from 1. */
export type CalendarDate = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` as a calendar date, or null when it is not one (2001-02-30, 2001-13-01). */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Today's date where it is earliest: UTC-12, the last time zone to reach a new day. A birthday
 * counts only once it has begun everywhere, so nobody passes the screen early wherever they
 * are; an adult waits at most one day.
 */
export function calendarDateAnywhereOnEarth(now: Date): CalendarDate {
  const shifted = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Whether someone born on `dob` has had their 18th birthday by `today`. The birthday itself
 * counts. A 29 February birthday falls on 1 March in a common year.
 */
export function isAdultOn(dob: CalendarDate, today: CalendarDate): boolean {
  const birthday = { year: dob.year + ADULT_AGE, month: dob.month, day: dob.day };
  if (birthday.month === 2 && birthday.day === 29 && daysInMonth(birthday.year, 2) === 28) {
    birthday.month = 3;
    birthday.day = 1;
  }
  return compareDates(birthday, today) <= 0;
}

/** The refusal's `details.reason`. The message never names an age or hints at the cut-off. */
export const SIGNUP_REFUSED = 'signup_refused';
const SIGNUP_REFUSED_MESSAGE = 'We can’t make you an account';

/** The error a refused sign-up gets (403). */
export function signupRefused(): AppError {
  return forbidden(SIGNUP_REFUSED_MESSAGE, { reason: SIGNUP_REFUSED });
}

/** True for the error `signupRefused()` makes. */
export function isSignupRefusal(err: unknown): err is AppError {
  if (!(err instanceof AppError) || err.code !== 'forbidden') return false;
  const details: unknown = err.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    details.reason === SIGNUP_REFUSED
  );
}

/** A date of birth as `YYYY-MM-DD`: a real calendar date, from MIN_BIRTH_YEAR on. */
const dateOfBirthSchema = z.string().refine((value) => {
  const date = parseCalendarDate(value);
  return date !== null && date.year >= MIN_BIRTH_YEAR;
}, 'Enter a real date of birth');

const adultAttested = z.literal(true, { error: 'Seekers must pass the age screen' });

export type AccountTypeInput =
  | {
      accountType: 'seeker';
      adultAttested: true;
      /** From the age screen. Internal callers (fixtures) may leave it out. */
      birthYear?: number;
    }
  | { accountType: 'host' };

const accountTypeInputSchema: z.ZodType<AccountTypeInput> = z.discriminatedUnion('accountType', [
  z.object({
    accountType: z.literal('seeker'),
    adultAttested,
    birthYear: z.number().int().min(MIN_BIRTH_YEAR).max(2100).optional(),
  }),
  z.object({ accountType: z.literal('host') }),
]);

/**
 * The body of POST /api/v1/onboarding. A seeker sends their date of birth; the bare "I'm 18 or
 * older" attestation is no longer accepted (legal review 2.6: it is weaker evidence).
 */
export const onboardingRequestSchema = z.discriminatedUnion('accountType', [
  z.object({ accountType: z.literal('seeker'), dateOfBirth: dateOfBirthSchema }),
  z.object({ accountType: z.literal('host'), organizationName: organizationNameSchema }),
]);
export type OnboardingRequest = z.output<typeof onboardingRequestSchema>;

/** Runs inside the transaction that sets the account type (seeker) or creates the organization (host). */
export type OnboardingInTx = (tx: Tx, accountType: 'seeker' | 'host') => Promise<void>;

export type OnboardingOptions = {
  inTx?: OnboardingInTx;
  /** The clock the age screen reads. Defaults to now. */
  now?: Date;
};

/**
 * Sets the user's account type, once. A seeker's age-screen result is stored with its time,
 * and the birth year when given. Throws bad_request for invalid input (including `operator`),
 * not_found for an unknown or deleted user and conflict if the type is already set. Records
 * `identity.account_type_set`, whose data is the account type only.
 *
 * The Clerk call runs inside the transaction, so if Clerk fails nothing is saved and the user
 * can simply retry.
 */
export async function setAccountType(
  db: Db,
  clerk: ClerkAdmin,
  userId: string,
  input: AccountTypeInput,
  opts?: { inTx?: OnboardingInTx },
): Promise<void> {
  const parsed = accountTypeInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest('Invalid account type', parsed.error.issues);
  const { accountType } = parsed.data;
  const birthYear = parsed.data.accountType === 'seeker' ? (parsed.data.birthYear ?? null) : null;

  await withTx(db, async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        accountType,
        adultAttestedAt: accountType === 'seeker' ? sql`now()` : null,
        birthYear,
      })
      .where(and(eq(users.id, userId), isNull(users.accountType), isNull(users.deletedAt)))
      .returning({ clerkUserId: users.clerkUserId });

    if (!updated) {
      const [existing] = await tx
        .select({ deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, userId));
      if (!existing || existing.deletedAt) throw notFound('User not found');
      throw conflict('Account type is already set');
    }

    await record(tx, {
      actorType: 'user',
      actorId: userId,
      action: 'identity.account_type_set',
      subjectType: 'user',
      subjectId: userId,
      data: { accountType },
    });
    await clerk.setPublicMetadata(updated.clerkUserId, { account_type: accountType });
    if (opts?.inTx) await opts.inTx(tx, accountType);
  });
}

/**
 * The age screen: the birth year of an adult, or `signupRefused()` for anyone under the
 * cut-off. A date after today is a typing mistake (bad_request), not a refusal.
 */
function screenAge(dateOfBirth: string, now: Date): number {
  const dob = parseCalendarDate(dateOfBirth);
  if (!dob || dob.year < MIN_BIRTH_YEAR) throw badRequest('Enter a real date of birth');
  const today = calendarDateAnywhereOnEarth(now);
  if (compareDates(dob, today) > 0) throw badRequest('Enter a date before today');
  if (!isAdultOn(dob, today)) throw signupRefused();
  return dob.year;
}

/**
 * Runs onboarding for POST /api/v1/onboarding and returns where to send the user.
 * A seeker passes the age screen first; a refused one gets `signupRefused()` and nothing is
 * saved. A host also creates their first organization. If that failed after the account type
 * was saved, calling this again finishes it; once the host has an organization it throws
 * conflict.
 *
 * Creating the organization holds a lock on the user's row from the membership check until the
 * organization is recorded, Clerk call included. So a form submitted twice at once creates one
 * organization: the second request waits for the first, then finds its membership.
 */
export async function completeOnboarding(
  db: Db,
  clerk: ClerkAdmin,
  userId: string,
  input: OnboardingRequest,
  opts?: OnboardingOptions,
): Promise<{ redirectTo: '/' | '/host' }> {
  if (input.accountType === 'seeker') {
    const birthYear = screenAge(input.dateOfBirth, opts?.now ?? new Date());
    await setAccountType(
      db,
      clerk,
      userId,
      { accountType: 'seeker', adultAttested: true, birthYear },
      { inTx: opts?.inTx },
    );
    return { redirectTo: '/' };
  }

  const [user] = await db
    .select({ accountType: users.accountType, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.deletedAt) throw notFound('User not found');

  if (user.accountType === null) {
    await setAccountType(db, clerk, userId, { accountType: 'host' });
  } else if (user.accountType !== 'host') {
    throw conflict('Account type is already set');
  }

  await withTx(db, async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    if (await findHostMembership(tx, userId, null)) throw conflict('Account type is already set');
    await createOrganization(tx, clerk, { ownerUserId: userId, name: input.organizationName });
    if (opts?.inTx) await opts.inTx(tx, 'host');
  });
  return { redirectTo: '/host' };
}
