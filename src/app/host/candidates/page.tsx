import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Candidates · Explore&Earn' };

export default async function CandidatesPage() {
  notFoundInProd();
  await hostPage('/host/candidates');
  return (
    <Placeholder
      title="Candidates"
      subProject={5}
      name="Host hiring"
      icon={hostNavIcons.candidates}
      description="Candidate pools, and seekers you can invite to apply."
    />
  );
}
