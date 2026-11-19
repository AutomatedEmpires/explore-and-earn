import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { idParamSchema } from '@/lib/messaging';
import { hostPage, notFoundInProd } from '@/server/shell';
import { orgName } from '../../../applicants/_server/org';
import { ReplyScreen } from '../../_components/ReplyScreen';

export const metadata: Metadata = { title: 'Reply · Explore&Earn' };

// The reply step of flow D (Figma 01 Host, 45:14113): a ready note to one applicant, sent with
// one tap. The screen reads the thread and sends through /api/v1/threads, which checks that the
// member takes part in it. Like the other SP5 host screens, it stays out of production until
// SP5 ships.
export default async function ReplyPage({ params }: { params: Promise<{ threadId: string }> }) {
  notFoundInProd();
  const { threadId } = await params;
  if (!idParamSchema.safeParse({ id: threadId }).success) notFound();
  const host = await hostPage(`/host/messages/${threadId}/reply`);
  return (
    <ReplyScreen
      threadId={threadId}
      orgName={await orgName(host.orgId)}
      applicantsHref="/host/applicants"
    />
  );
}
