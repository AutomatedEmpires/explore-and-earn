import type { Metadata } from 'next';
import { ApplicantsScreen } from '../../_reference/ApplicantsScreen';

export const metadata: Metadata = { title: 'Reference: Candidate card' };

/** The design board's candidate card artboard: host Applicants. */
export default function CandidateReference() {
  return <ApplicantsScreen />;
}
