'use client';

// ReportSheet: the report form in a Sheet, opened from `trigger` (SP4 spec 7 and 8.7).
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 33) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';
import type { ReportSubjectType } from '@/lib/safety';

export type ReportSheetProps = {
  subject: { type: ReportSubjectType; id: string };
  trigger: ReactNode;
};

export function ReportSheet(_props: ReportSheetProps): ReactNode {
  return null;
}
