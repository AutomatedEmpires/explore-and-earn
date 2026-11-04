import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Interviews · Explore&Earn' };

export default async function InterviewsPage() {
  notFoundInProd();
  await hostPage('/host/interviews');
  return (
    <Placeholder
      title="Interviews"
      subProject={5}
      name="Host hiring"
      icon={hostNavIcons.interviews}
      description="Schedule interviews and keep track of them, built in."
    />
  );
}
