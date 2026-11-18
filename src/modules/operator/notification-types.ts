// eslint-disable-next-line no-restricted-imports
import { adminUrl, defineType } from '@/modules/notifications/types';

defineType({
  type: 'operator.daily_digest',
  category: 'operator',
  mandatory: true,
  title: (d) => `Daily digest · ${String(d.dateLabel)}`,
  body: () => "Open the email for yesterday's numbers.",
  url: () => adminUrl('/'),
  email: { template: 'OperatorDigest' },
});
