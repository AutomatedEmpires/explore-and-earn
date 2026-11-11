'use client';

// ReportForm: the reason Radio list, details Textarea and the thanks line, shared by ReportSheet
// and /report (SP4 spec 7).
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 33) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';
import type { ReportSubjectType } from '@/lib/safety';

export type ReportFormProps = {
  subject: { type: ReportSubjectType; id: string };
  /** After the report is sent and the thanks line shows. */
  onSubmitted?(reportId: string): void;
};

export function ReportForm(_props: ReportFormProps): ReactNode {
  return null;
}
