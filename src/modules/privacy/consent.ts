// W5 fills consent records. W0 keeps the names the engine and the retention rules spread.
import type { DbOrTx } from '@/lib/db';

export const CONSENT_TABLES: readonly string[] = [];

export async function recordConsent(_db: DbOrTx, _input: unknown): Promise<void> {}

export async function exportConsent(_db: DbOrTx, _userId: string): Promise<unknown[]> {
  return [];
}

export async function eraseConsentLinks(_db: DbOrTx, _userId: string): Promise<number> {
  return 0;
}
