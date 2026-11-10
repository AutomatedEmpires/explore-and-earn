// Operator copy for landing pages (SP3 spec 3.2 and section 7). W0 stub: W8 replaces it
// (Task 44).
import type { Db, DbOrTx } from '@/lib/db';
import type { LandingKind, LandingPage } from './resolve';

/** What an operator saves for one page. */
export type LandingCopyInput = {
  title: string;
  intro: string;
  heroMediaId: string | null;
  heroAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

/** Validates and upserts the copy for a key that resolves, and audits `landing.copy_saved`. */
export async function saveLandingCopy(
  _db: Db,
  _key: string,
  _i: LandingCopyInput,
  _actor: { operatorId: string },
): Promise<void> {
  throw new Error('not implemented: saveLandingCopy');
}

/** Every key that resolves, with its effective title and whether a stored row exists. */
export async function listLandingCopy(
  _db: DbOrTx,
  _now: Date,
): Promise<{ key: string; kind: LandingKind; path: string; title: string; custom: boolean }[]> {
  throw new Error('not implemented: listLandingCopy');
}

/** The resolved page and its stored copy; null when the key does not resolve. */
export async function getLandingCopy(
  _db: DbOrTx,
  _key: string,
  _now: Date,
): Promise<{ page: LandingPage; stored: LandingCopyInput | null } | null> {
  throw new Error('not implemented: getLandingCopy');
}
