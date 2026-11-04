import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { MessageSquare } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Messages · Explore&Earn' };

export default async function MessagesPage() {
  notFoundInProd();
  await hostPage('/host/messages');
  return (
    <Placeholder
      title="Messages"
      subProject={5}
      name="Host hiring"
      icon={MessageSquare}
      description="Conversations with applicants and candidates."
    />
  );
}
