// Module-load registrations: the `listing` and `org` report subjects (SP4 spec 6; plan
// Task 24), imported by index.ts for its side effects. A listing report goes to SP2's `listing`
// trust handlers; an org report goes to the `organization` subject, whose handlers SP8
// registers (suspend, ban, restore). Profiles registers `seeker_profile`, and messaging
// registers `message` and `thread`.
import { getHostIdentities } from '@/modules/hostpages';
import { getListingSummaries } from '@/modules/listings';
import { registerReportSubject } from './reports';

registerReportSubject('listing', {
  trustSubjectType: 'listing',
  exists: async (db, id) => (await getListingSummaries(db, [id])).has(id),
});

registerReportSubject('org', {
  trustSubjectType: 'organization',
  exists: async (db, id) => (await getHostIdentities(db, [id])).has(id),
});
