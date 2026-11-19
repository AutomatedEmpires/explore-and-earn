// The listings notification types (spec section 6). Email types use the HostNotice template,
// whose button follows `data.href` (a path on the app) and `data.buttonLabel`.
import { defineType, type NotificationData } from '@/modules/notifications';

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

const titleOf = (d: NotificationData) => text(d.title) ?? 'Your listing';
const listingUrl = (d: NotificationData) =>
  text(d.href) ?? (text(d.listingId) ? `/host/listings/${String(d.listingId)}` : '/host/listings');

/** Every type, so a test or the registry can list them. */
export const LISTING_NOTIFICATION_TYPES = [
  'listings.live',
  'listings.in_review',
  'listings.returned',
  'listings.removed',
  'listings.approval_requested',
  'listings.approval_decided',
  'listings.still_hiring',
  'listings.auto_closed',
  'listings.repost_reminder',
] as const;

defineType({
  type: 'listings.live',
  category: 'jobs',
  title: (d) => `${titleOf(d)} is live`,
  body: () => 'Seekers can find it and apply now.',
  url: listingUrl,
  email: { template: 'HostNotice' },
});

defineType({
  type: 'listings.in_review',
  category: 'jobs',
  title: () => "We're taking a closer look",
  body: (d) =>
    `We're checking ${titleOf(d)} before it goes live. This usually takes a few hours, and we'll let you know when it's done.`,
  url: listingUrl,
});

defineType({
  type: 'listings.returned',
  category: 'account',
  title: (d) => `${titleOf(d)} needs changes`,
  body: (d) => {
    const note = text(d.note);
    const lead = "We couldn't publish it yet.";
    return note
      ? `${lead} ${note}\nOpen the listing to see what to change, or ask for a review.`
      : `${lead} Open the listing to see what to change, or ask for a review.`;
  },
  url: listingUrl,
  email: { template: 'HostNotice' },
  push: true,
});

defineType({
  type: 'listings.removed',
  category: 'account',
  mandatory: true,
  title: (d) => `${titleOf(d)} was removed`,
  body: () =>
    "It doesn't meet our listing rules, so seekers can no longer see it. Open it to see why, or ask for a review.",
  url: listingUrl,
  email: { template: 'HostNotice' },
});

defineType({
  type: 'listings.approval_requested',
  category: 'jobs',
  title: (d) => `${titleOf(d)} is waiting for your approval`,
  body: (d) =>
    `${text(d.submitterName) ?? 'A recruiter on your team'} wants to publish it. Review it to approve it or send it back.`,
  url: listingUrl,
  email: { template: 'HostNotice' },
  push: true,
});

defineType({
  type: 'listings.approval_decided',
  category: 'jobs',
  title: (d) =>
    d.decision === 'approve' ? `${titleOf(d)} was approved` : `${titleOf(d)} was sent back`,
  body: (d) => {
    const note = text(d.note);
    if (d.decision === 'approve')
      return "Your team approved it. We're checking it before it goes live.";
    return note
      ? `Your team sent it back with a note: ${note}`
      : 'Your team sent it back. Open it to make changes and publish again.';
  },
  url: listingUrl,
  email: { template: 'HostNotice' },
  push: true,
});

defineType({
  type: 'listings.still_hiring',
  category: 'jobs',
  title: () => 'Still hiring?',
  body: (d) =>
    `Are you still hiring for ${titleOf(d)}? Open the listing and choose Yes, Edit or Close.`,
  url: listingUrl,
  email: { template: 'HostNotice' },
  push: true,
});

defineType({
  type: 'listings.auto_closed',
  category: 'jobs',
  title: (d) => `${titleOf(d)} has closed`,
  body: () =>
    'Its end date has passed, so it closed on its own. You can repost it from your Library.',
  url: listingUrl,
  email: { template: 'HostNotice' },
});

defineType({
  type: 'listings.repost_reminder',
  category: 'jobs',
  title: (d) => `Time to repost ${titleOf(d)}?`,
  body: () =>
    'It went live around this time last year. Repost it and we move its dates forward a year.',
  url: listingUrl,
  email: { template: 'HostNotice' },
});
