// Imports every SP2 module for its module-load registrations (SP2 plan, Global Constraints):
// usage counters, subject handlers, notification types, providers and the weather org filter
// are registered by files each module's index imports. A route or job may import only one
// module (billing never imports listings, yet getCapacity(db, orgId, 'listing_slot') needs the
// counter listings registers), so the API wrapper, the jobs route and every page that calls an
// SP2 module import this file. No module imports it.
import { registerOrgNotificationTypes } from '@/modules/orgs';
import '@/modules/orgs';
import '@/modules/entitlements';
import '@/modules/billing';
import '@/modules/locations';
import '@/modules/listings';
import '@/modules/hostpages';
import '@/modules/verification';

registerOrgNotificationTypes();
