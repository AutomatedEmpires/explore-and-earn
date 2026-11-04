// Shared types of the listings module (spec section 3). Re-exported from ./index.
import type { DbOrTx } from '@/lib/db';
import type { Category } from '@/lib/taxonomy';
import type { ListingContent } from './content';

export type ListingState = 'draft' | 'in_review' | 'active' | 'closed' | 'removed';

export type PublishedListing = {
  listingId: string;
  revisionId: string;
  orgId: string;
  content: ListingContent;
  firstPublishedAt: Date;
  publishedAt: Date;
  confirmedActiveAt: Date | null;
  autoCloseAt: Date | null;
  /** From applying.deadline (section 8.2); the listing stays active after it. */
  applicationsCloseAt: Date | null;
  provenance: 'host_created' | 'imported' | 'sourced';
};

export type ListingSummary = {
  orgId: string;
  title: string;
  state: ListingState;
  locationId: string | null;
  primaryCategory: Category;
  publishedRevisionId: string | null;
};

export type ListingStats = { views: number; saves: number; applications: number; hires: number };

export type ListingStatsProvider = (
  db: DbOrTx,
  ids: string[],
) => Promise<Map<string, Partial<ListingStats>>>;

export type ListingRowBadgeProvider = (
  db: DbOrTx,
  orgId: string,
  ids: string[],
) => Promise<Map<string, { label: string; href: string }>>;

export type HomeReminder = {
  kind: 'still_hiring' | 'approval' | 'verification' | 'payment' | 'repost';
  listingId: string | null;
  title: string;
  href: string;
  at: Date;
};

export type HomeSummary = {
  reminders: HomeReminder[];
  quota: {
    listingSlots: { used: number; limit: number };
    seats: { used: number; limit: number };
    inviteCredits: { balance: number; resetsAt: Date | null };
  };
  setup: { location: boolean; plan: boolean; firstListing: boolean };
};
