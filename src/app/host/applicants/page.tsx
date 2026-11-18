import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { ApplicantsScreen } from './_components/ApplicantsScreen';
import { orgName } from './_server/org';

export const metadata: Metadata = { title: 'Applicants · Explore&Earn' };

// Applicants (Figma 01 Host, 45:13683): everyone waiting on a reply, the start of flow D. The
// screen reads and acts through /api/v1/host/applicants, which checks the member's role and
// listing scope. Like the other SP5 host screens, it stays out of production until SP5 ships.
export default async function ApplicantsPage() {
  notFoundInProd();
  const host = await hostPage('/host/applicants');
  return <ApplicantsScreen orgName={await orgName(host.orgId)} replyBase="/host/messages" />;
}
