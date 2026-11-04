import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Billing · Explore&Earn' };

export default async function BillingPage() {
  notFoundInProd();
  await hostPage('/host/billing');
  return (
    <Placeholder
      title="Billing"
      subProject={2}
      name="Host supply and billing"
      icon={hostNavIcons.billing}
      description="Your plan, extra listing slots, invoices and payment method."
    />
  );
}
