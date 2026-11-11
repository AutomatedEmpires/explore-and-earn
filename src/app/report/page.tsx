// /report?subject=<type>:<id> (SP4 spec 7): the full-page report form SP3 links to. W0 contract
// stub (SP4 plan Task 6): W7 builds it (Task 33) after the founder approves the design in Figma.
// Until then it renders nothing.
import type { ReactNode } from 'react';

export default function ReportPage(_props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): ReactNode {
  return null;
}
