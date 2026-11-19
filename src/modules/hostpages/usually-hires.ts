// "Usually hires Feb–Apr" (SP2 spec section 8.5): when a host isn't hiring, the circular window of
// 1-3 consecutive months holding the most first-publish dates of its past listings.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Window = { start: number; length: number; count: number };

/**
 * The months a host usually hires in, such as `Feb`, `Feb–Apr` or `Nov–Jan` (en dash), or null
 * for fewer than 2 dates. Dates are binned by UTC month. Each window is trimmed of empty end
 * months; the highest count wins, then the shorter window, then the earliest start (January
 * first).
 */
export function usuallyHires(dates: Date[]): string | null {
  if (dates.length < 2) return null;
  const counts = Array.from({ length: 12 }, () => 0);
  for (const d of dates) {
    const m = d.getUTCMonth();
    if (Number.isInteger(m)) counts[m] = (counts[m] ?? 0) + 1;
  }
  const at = (month: number) => counts[month % 12] ?? 0;

  let best: Window | null = null;
  for (let start = 0; start < 12; start++) {
    for (let length = 1; length <= 3; length++) {
      // Trim empty months from both ends.
      let s = start;
      let len = length;
      while (len > 0 && at(s) === 0) {
        s++;
        len--;
      }
      while (len > 0 && at(s + len - 1) === 0) len--;
      if (len === 0) continue;

      let count = 0;
      for (let i = 0; i < len; i++) count += at(s + i);
      const w: Window = { start: s % 12, length: len, count };
      if (
        !best ||
        w.count > best.count ||
        (w.count === best.count && w.length < best.length) ||
        (w.count === best.count && w.length === best.length && w.start < best.start)
      ) {
        best = w;
      }
    }
  }
  if (!best) return null;

  const first = MONTHS[best.start];
  const last = MONTHS[(best.start + best.length - 1) % 12];
  return best.length === 1 ? `${first}` : `${first}–${last}`;
}
