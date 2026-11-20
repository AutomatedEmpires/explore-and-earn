// Pay normalization and display (SP3 spec 8.2). W0 stub: W1 replaces the bodies (Task 6).
import type { ListingContent } from '@/modules/listings';

/** Cents per hour (and per year at 52 weeks), the pure core of toHourlyCents. */
export function normalizePay(_c: Pick<ListingContent, 'pay' | 'when'>): {
  minCents: number | null;
  maxCents: number | null;
  yearlyMinCents: number | null;
} {
  throw new Error('not implemented: normalizePay');
}

/** The card chip, the full line and the detail lines, in the listing's own unit. */
export function formatPay(_c: Pick<ListingContent, 'pay' | 'when'>): {
  chip: string;
  full: string;
  details: string[];
} {
  throw new Error('not implemented: formatPay');
}
