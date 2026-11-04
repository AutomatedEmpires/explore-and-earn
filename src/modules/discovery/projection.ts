// Projection rows from SP2 listings (SP3 spec sections 4 and 8.2). W0 stub: W1 replaces it
// (Tasks 6 and 8).
import type { ListingContent } from '@/modules/listings';

/** The listing's pay in cents per hour (spec 8.2); SP5's fit score uses it too. */
export function toHourlyCents(_c: Pick<ListingContent, 'pay' | 'when'>): {
  minCents: number | null;
  maxCents: number | null;
} {
  throw new Error('not implemented: toHourlyCents');
}
