// Public API of the landing module (SP3 spec 3.2): landing page resolution and copy, sitemaps,
// robots and the JSON-LD builders. Complete from W0 (Plan decision 2). Depends on discovery;
// discovery never imports landing.
import 'server-only';
import type { HandlerMap } from '@/modules/jobs';

export {
  listLandingPaths,
  OFFICIAL_VISA_LINKS,
  resolveLanding,
  type LandingKind,
  type LandingPage,
} from './resolve';
export { buildBreadcrumbJsonLd, buildJobPostingJsonLd } from './jsonld';
export {
  buildRobots,
  renderSitemapIndex,
  renderUrlset,
  sitemapEntries,
  sitemapNames,
} from './sitemaps';
export { getLandingCopy, listLandingCopy, saveLandingCopy, type LandingCopyInput } from './copy';
export { privacyHandler, retentionRules } from './privacy';

export const jobHandlers: HandlerMap = {};
