// The applications module's notification types (SP4 spec 6). Each notify call passes `data.url`;
// data holds only ids, `listingTitle`, `orgName` and `firstName`. No type is mandatory. SP4 sends
// no status-change notification: host moves reach the seeker through SP5's threads.
import { defineType, type NotificationData } from '@/modules/notifications';

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const urlOr = (fallback: string) => (d: NotificationData) => str(d.url) ?? fallback;

defineType({
  type: 'applications.submitted',
  category: 'applications',
  title: (d) => {
    const org = str(d.orgName);
    return org ? `Your application to ${org} was sent` : 'Your application was sent';
  },
  body: (d) => {
    const title = str(d.listingTitle);
    return title
      ? `We sent your application for ${title}. You can follow it in My jobs.`
      : 'You can follow your application in My jobs.';
  },
  url: urlOr('/profile/applied'),
  email: { template: 'ApplicationReceipt' },
});

defineType({
  type: 'applications.new_applicant',
  category: 'applications',
  title: (d) => {
    const title = str(d.listingTitle);
    return title ? `New applicant for ${title}` : 'New applicant';
  },
  body: (d) => {
    const name = str(d.firstName);
    return name ? `${name} applied. Open Applicants to review.` : 'Open Applicants to review.';
  },
  url: urlOr('/host/applicants'),
  email: { template: 'Digest', batch: { key: 'new_applicants', delayMinutes: 60 } },
  push: true,
});

defineType({
  type: 'applications.withdrawn',
  category: 'applications',
  title: (d) => {
    const title = str(d.listingTitle);
    return title ? `An applicant withdrew from ${title}` : 'An applicant withdrew';
  },
  body: (d) => {
    const name = str(d.firstName);
    return name ? `${name} withdrew their application.` : 'They withdrew their application.';
  },
  url: urlOr('/host/applicants'),
});
