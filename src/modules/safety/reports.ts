// Reports and the report subject registry (SP4 spec 8.7). W0 stub: W5 implements it (Task 24).
// Registration is a no-op until then.
import type { Db, DbOrTx } from '@/lib/db';
import type {
  ReportInput,
  Reporter,
  ReportSubjectRegistration,
  ReportSubjectType,
  ReportSummary,
} from '@/lib/safety';

/** A repeat within 24 hours returns the first report with `created: false`. */
export async function report(
  _db: Db,
  _reporter: Reporter,
  _i: ReportInput,
): Promise<{ reportId: string; created: boolean }> {
  throw new Error('not implemented: report');
}

/** Unregistered subject types are `bad_request`. */
export function registerReportSubject(_t: ReportSubjectType, _r: ReportSubjectRegistration): void {}

/** For the console's Safety tab (SP8). */
export async function listReportsAbout(
  _db: DbOrTx,
  _i: { subjectType: ReportSubjectType; subjectId: string },
): Promise<ReportSummary[]> {
  throw new Error('not implemented: listReportsAbout');
}
