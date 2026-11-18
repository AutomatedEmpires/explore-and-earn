// eslint-disable-next-line no-restricted-imports
import { defineType } from '@/modules/notifications/types';

defineType({
  type: 'legal.updated',
  category: 'account',
  mandatory: true,
  title: (d) => `We're updating our ${String(d.title)}`,
  body: (d) => `The new version takes effect on ${String(d.effectiveDate)}. ${String(d.summaryOfChanges)}`,
  url: (d) => (typeof d.slug === 'string' ? `/legal/${d.slug}` : null),
  email: { template: 'LegalUpdate' },
});
