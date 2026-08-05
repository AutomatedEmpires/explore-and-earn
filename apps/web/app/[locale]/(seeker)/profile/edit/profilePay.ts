/**
 * Convert stored integer cents into the exact decimal value expected by a
 * number input. Keeping both decimal places prevents a profile-only save from
 * silently rounding a value such as 1,750 cents to 1,800 cents.
 */
export function formatPayCentsForInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export type ParsedPayInput =
  | { readonly ok: true; readonly cents: number | null }
  | { readonly ok: false };

/**
 * Parse a non-negative dollar input without floating-point rounding. Blank
 * means the preference was intentionally cleared; malformed or sub-cent input
 * remains invalid instead of being collapsed into that null state.
 */
export function parsePayInput(value: string): ParsedPayInput {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, cents: null };

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { ok: false };

  const wholeDollars = Number(match[1]);
  const fractionalCents = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = wholeDollars * 100 + fractionalCents;
  return Number.isSafeInteger(cents) ? { ok: true, cents } : { ok: false };
}
