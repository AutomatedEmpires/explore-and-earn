// Imports the SP4 modules for their module-load registrations (SP4 plan Task 5): notification
// types, trust subject handlers, report subjects, SP3's seeker overlay, SP2's listing stats
// provider and the resume media reference checker are registered by files each module's index
// imports. A route or job may import none of these modules and still depend on them (the worker
// expiring imports needs applications' resume reference checker), so the API wrapper
// (src/server/api.ts) and the job handler map (src/server/job-handlers.ts) import this file. No
// module imports it. Later sub-projects append their own modules here.
import '@/modules/profiles';
import '@/modules/applications';
import '@/modules/safety';
