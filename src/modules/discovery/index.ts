// Public API of the discovery module (SP3 spec 3.1): the search projection and its sync, search,
// the map, the deck, listing detail, dispositions, listing events, saved searches and alerts,
// and the placement and overlay hooks. Complete from W0 (Plan decision 2): every name used
// outside the module is here, and owners replace the stubs behind it without editing this file.
// Depends on listings, hostpages and locations (SP2) and Foundation; never on landing.
import 'server-only';
import { registerListingStatsProvider, type ListingStatsProvider } from '@/modules/listings';
import type { HandlerMap } from '@/modules/jobs';
import { alertHandlers } from './alerts';
import { eventHandlers, listingStats } from './events';
import { syncHandlers } from './sync';
// defineType() for the alert notification types.
import './notification-types';

export type {
  Amenity,
  DiscoveryExport,
  DiscoveryQuery,
  DiscoverySort,
  DiscoverySource,
  DispositionState,
  FilterChip,
  FilterOptions,
  HostPreview,
  JobCardData,
  ListingDetail,
  ListingEventType,
  MapCluster,
  MapPin,
  QueryLabels,
  Season,
  StateCount,
} from '@/lib/discovery';

export {
  countNewListings,
  getJobCards,
  matchListingIds,
  searchListings,
  type SearchInput,
} from './search';
export { locationPreview, mapPins } from './map';
export { suggest } from './suggest';
// Browse by State (FD-8 addendum).
export { countListingsByState } from './state-counts';
// Landing sitemaps. Search stays capped; this feed does not.
export {
  hasActiveListing,
  landingCoverage,
  listActiveListings,
  type ActiveListing,
  type LandingCoverage,
} from './feed';
export { getListingDetail } from './detail';
export { getFilterOptions, getQueryLabels, prepareQuery } from './query-context';
export { toHourlyCents } from './projection';
export {
  clearDisposition,
  listSavedJobs,
  listSkippedJobs,
  restoreSkippedJob,
  setDisposition,
  unsaveJob,
} from './dispositions';
export { dedupeKeyFor, getListingEventCounts, recordListingEvent } from './events';
export {
  getPlacementHook,
  noopHook,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
  type BoostPlacementHook,
  type PlacementInput,
  type PlacementOutput,
  type SeekerOverlayProvider,
} from './hooks';
export { rebuildSearchProjection } from './sync';
export {
  createSavedSearch,
  deleteSavedSearch,
  getAlertSettings,
  listSavedSearches,
  setAlertSettings,
  updateSavedSearch,
  type SavedSearchItem,
} from './saved-searches';
export { eraseUserData, exportUserData, privacyHandler, retentionRules } from './privacy';
export { seedSynthetic } from './seed';
// The projection row shape and its search document (tests/helpers/discovery-rows.ts).
export type { ProjectionRow, ProjectionRowInput } from './projection-columns';
export { searchVectorSql, type SearchVectorFields } from './search-vector';

export const jobHandlers: HandlerMap = { ...syncHandlers, ...eventHandlers, ...alertHandlers };

// SP2's listing library shows each listing's views and saves (spec 3.1).
const stats: ListingStatsProvider = listingStats;
registerListingStatsProvider('discovery', stats);
