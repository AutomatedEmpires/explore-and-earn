import type { AsDescribedSummary } from '@/lib/hiring';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'season' | 'all';
export type Metric = { value: number; previous: number | null };
export type Slice = { key: string; label: string; value: number };
export type HostAnalytics = {
  tiles: Record<'views' | 'saves' | 'applications' | 'interviews' | 'hires' | 'followers', Metric>;
  funnel: Slice[];
  perListing: Slice[];
  weekly: { week: string; views: number; applications: number }[];
  invites: Slice[];
  boost: { listingId: string; before: number; during: number }[];
  asDescribed: AsDescribedSummary;
  sources: Slice[];
  statuses: Slice[];
};
