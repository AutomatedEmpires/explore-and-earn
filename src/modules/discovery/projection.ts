// Projection rows from SP2 listings (SP3 spec sections 4 and 8.2). W1 fills the row builder and
// the upsert in Task 8.
import { normalizePay } from '@/lib/discovery';
import type { ListingContent } from '@/modules/listings';

/** The listing's pay in cents per hour (spec 8.2); SP5's fit score uses it too. */
export function toHourlyCents(c: Pick<ListingContent, 'pay' | 'when'>): {
  minCents: number | null;
  maxCents: number | null;
} {
  const { minCents, maxCents } = normalizePay(c);
  return { minCents, maxCents };
}
