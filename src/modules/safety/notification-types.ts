// The safety module's notification type (SP4 spec 6). The reporter never learns the outcome
// (engineering decision), and the type leads nowhere.
import { defineType } from '@/modules/notifications';

defineType({
  type: 'safety.report_received',
  category: 'account',
  title: () => 'Thanks for your report',
  body: () => 'We review every report and act on anything that breaks our rules.',
  url: () => null,
});
