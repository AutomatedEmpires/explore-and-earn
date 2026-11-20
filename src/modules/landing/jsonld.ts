// Structured data for listing and landing pages (SP3 spec 8.11). Every `<` in the output is
// escaped as <. W0 stub: W8 replaces it (Task 41).
import type { ListingDetail } from '@/modules/discovery';

/** JobPosting JSON-LD for an active listing page. */
export function buildJobPostingJsonLd(_d: ListingDetail, _appUrl: string): string {
  throw new Error('not implemented: buildJobPostingJsonLd');
}

/** BreadcrumbList JSON-LD. */
export function buildBreadcrumbJsonLd(
  _items: { name: string; path: string }[],
  _appUrl: string,
): string {
  throw new Error('not implemented: buildBreadcrumbJsonLd');
}
