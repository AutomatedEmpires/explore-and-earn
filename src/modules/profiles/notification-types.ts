// The profiles module's notification types (SP4 spec 6). Each notify call passes `data.url`;
// data holds only ids and `firstName`. No type is mandatory.
import { IMPORT_FAILED } from '@/lib/profiles/copy';
import { defineType, type NotificationData } from '@/modules/notifications';

const urlOr = (fallback: string) => (d: NotificationData) =>
  typeof d.url === 'string' && d.url !== '' ? d.url : fallback;

defineType({
  type: 'profiles.availability_reconfirm',
  category: 'account',
  title: () => 'Are you still available?',
  body: () => "Confirm your start date so hosts know you're still looking.",
  url: urlOr('/profile?sheet=availability'),
  email: { template: 'AvailabilityReconfirm' },
  push: true,
});

defineType({
  type: 'profiles.availability_hidden',
  category: 'account',
  title: () => "Hosts can't find you right now",
  body: () =>
    "You haven't confirmed your availability in 90 days, so hosts no longer see you in their searches. Confirm your date to show up again.",
  url: urlOr('/profile?sheet=availability'),
  email: { template: 'AvailabilityReconfirm' },
});

defineType({
  type: 'profiles.import_ready',
  category: 'account',
  title: () => 'Your resume is ready to review',
  body: () => 'Check each field before anything is saved to your profile.',
  url: urlOr('/profile/import'),
  push: true,
});

defineType({
  type: 'profiles.import_failed',
  category: 'account',
  title: () => "We couldn't read your resume",
  body: () => IMPORT_FAILED,
  url: urlOr('/profile/import'),
});

defineType({
  type: 'profiles.content_removed',
  category: 'account',
  title: () => 'We removed part of your profile',
  body: () =>
    "Part of your profile didn't meet our community rules, so we took it down. You can add new details any time.",
  url: urlOr('/profile'),
  email: { template: 'SeekerNotice' },
});
