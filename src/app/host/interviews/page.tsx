import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { CalendarDays } from '@/ui/icons';
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
      icon={CalendarDays}
      description="Schedule interviews and keep track of them, built in."
    />
  );
}
