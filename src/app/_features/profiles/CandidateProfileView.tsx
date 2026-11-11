// CandidateProfileView: a staged candidate card for SP5's candidate pages (SP4 spec 7 and 8.3):
// the pool card, or the live profile once revealed.
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 35) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';
import type { CandidateCard } from '@/lib/profiles';

export type CandidateProfileViewProps = { card: CandidateCard; resumeHref?: string };

export function CandidateProfileView(_props: CandidateProfileViewProps): ReactNode {
  return null;
}
