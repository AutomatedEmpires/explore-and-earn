// ApplicationSnapshotView: the frozen application as the seeker's receipt and SP5's applicant
// page show it (SP4 spec 7). Renders only from the snapshot, never a live listing.
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 35) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';
import type { ApplicationSnapshotV1 } from '@/lib/applications';

export type ApplicationSnapshotViewProps = {
  snapshot: ApplicationSnapshotV1;
  audience: 'seeker' | 'host';
  resumeHref: string;
};

export function ApplicationSnapshotView(_props: ApplicationSnapshotViewProps): ReactNode {
  return null;
}
