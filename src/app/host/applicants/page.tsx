import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { Inbox } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Applicants · Explore&Earn' };

export default async function ApplicantsPage() {
  notFoundInProd();
  await hostPage('/host/applicants');
  return (
    <Placeholder
      title="Applicants"
      subProject={5}
      name="Host hiring"
      icon={Inbox}
      description="Everyone who applied, moving through your hiring pipeline."
    />
  );
}
