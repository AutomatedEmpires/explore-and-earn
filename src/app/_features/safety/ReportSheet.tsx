'use client';

// ReportSheet: the report form in a Sheet, opened from `trigger` (SP4 spec 7 and 8.7; plan
// Task 33). The approved Filters sheet pattern (Figma 02 Seeker 175:14419): a bottom sheet below
// 768 px and a side panel above, the fields scrolling and the one primary button pinned in the
// footer. Radix returns focus to the trigger on close. A sent report shows the thanks line and
// Done; closing it resets the form for the next report.
import { useId, useState, type ReactNode } from 'react';
import type { ReportSubjectType } from '@/lib/safety';
import { Button, DialogClose, Sheet } from '@/ui/components';
import { REPORT_TITLES } from './copy';
import { ReportFields, ReportSubmit, ReportThanks, useReport } from './ReportForm';

export type ReportSheetProps = {
  subject: { type: ReportSubjectType; id: string };
  trigger: ReactNode;
};

export function ReportSheet({ subject, trigger }: ReportSheetProps): ReactNode {
  const report = useReport(subject);
  const formId = useId();
  const [open, setOpen] = useState(false);
  const sent = report.status.name === 'sent';

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && sent) report.reset();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={REPORT_TITLES[subject.type]}
      footer={
        sent ? (
          <DialogClose asChild>
            <Button size="lg" fullWidth variant="secondary">
              Done
            </Button>
          </DialogClose>
        ) : (
          <ReportSubmit report={report} formId={formId} />
        )
      }
    >
      {sent ? <ReportThanks /> : <ReportFields report={report} formId={formId} />}
    </Sheet>
  );
}
