// What a host types and what the builder shows: money, the pay amount ("$18–$20"), whole
// numbers, dates and the "Saved 6:14 PM" line. Pure, so the builder and its tests share it.

/** 1800 -> "18", 1850 -> "18.50", 1000000 -> "10,000". */
export function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** 11000 -> "$110". */
export function money(cents: number): string {
  return `$${dollars(cents)}`;
}

const AMOUNT = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** "$110" -> 11000. Undefined when empty, null when it is not an amount. */
export function parseMoney(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const m = AMOUNT.exec(t);
  if (!m) return null;
  const whole = Number((m[1] ?? '').replace(/,/g, ''));
  const fraction = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return whole * 100 + fraction;
}

export type PayAmount = { kind: 'fixed' | 'range'; minCents: number; maxCents: number };

/**
 * "18" (fixed), "$18–$20", "18-20" or "18 to 20" (a range). A range with equal ends is fixed.
 * Undefined when empty, null when it is not an amount or a range.
 */
export function parsePayAmount(text: string): PayAmount | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const parts = t.split(/\s*(?:[-–—]|\bto\b)\s*/i);
  if (parts.length === 1) {
    const cents = parseMoney(parts[0] ?? '');
    return typeof cents === 'number' ? { kind: 'fixed', minCents: cents, maxCents: cents } : null;
  }
  if (parts.length !== 2) return null;
  const min = parseMoney(parts[0] ?? '');
  const max = parseMoney(parts[1] ?? '');
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (min === max) return { kind: 'fixed', minCents: min, maxCents: max };
  return { kind: 'range', minCents: min, maxCents: max };
}

/** "$18–$20" for a range, "$18.50" for one amount. */
export function formatPayAmount(p: PayAmount): string {
  return p.kind === 'range' && p.maxCents !== p.minCents
    ? `${money(p.minCents)}–${money(p.maxCents)}`
    : money(p.minCents);
}

/** "40" -> 40. Undefined when empty, null when it is not a whole number. */
export function parseWholeNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** "40" or "37.5" -> a number. Undefined when empty, null otherwise. */
export function parseHours(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  return /^\d+(?:\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-05-18" -> "May 18, 2027"; anything else is returned as given. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : iso;
}

/** "Saved 6:14 PM", in the viewer's time. */
export function savedLabel(at: Date): string {
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Saved ${time}`;
}

/** Lines of a textarea, trimmed, without blanks. */
export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** Comma-separated items, trimmed, without blanks. */
export function commaItems(text: string): string[] {
  return text
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}
