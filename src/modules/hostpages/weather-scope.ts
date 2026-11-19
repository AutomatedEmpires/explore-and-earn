// Tells locations whose weather to refresh: the orgs that are entitled now (SP2 plan decision 5).
// Registered when the module's index is imported; locations imports no SP2 module.
import { getSubscriberBadges } from '@/modules/billing';
import { registerWeatherOrgFilter } from '@/modules/locations';

registerWeatherOrgFilter(async (db, orgIds) => [...(await getSubscriberBadges(db, orgIds)).keys()]);
