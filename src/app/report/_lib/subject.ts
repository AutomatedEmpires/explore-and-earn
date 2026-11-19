// `/report?subject=<type>:<id>` (SP4 spec 7): the subject a report is about. The type is one of
// the safety subject types and the id a UUID, as POST /reports requires (reportSchema).
import { z } from 'zod';
import { REPORT_SUBJECT_TYPES, type ReportSubjectType } from '@/lib/safety';

const subjectSchema = z.object({ type: z.enum(REPORT_SUBJECT_TYPES), id: z.uuid() });

export type ReportSubject = { type: ReportSubjectType; id: string };

/** The parsed subject, or null when it is missing or unreadable. */
export function parseReportSubject(raw: string | null): ReportSubject | null {
  if (!raw) return null;
  const colon = raw.indexOf(':');
  if (colon < 1) return null;
  const parsed = subjectSchema.safeParse({ type: raw.slice(0, colon), id: raw.slice(colon + 1) });
  return parsed.success ? parsed.data : null;
}
