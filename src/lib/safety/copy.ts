// Safety copy (SP4 spec 7 and 8.7; plan Task 4). Client-safe.
import type { SafetyReportReason } from './types';

/** The report form's reason Radio list (engineering decision). */
export const REPORT_REASON_LABELS: Record<SafetyReportReason, string> = {
  scam: 'Scam or fraud',
  asks_for_money: 'Asks for money',
  discrimination: 'Discrimination',
  harassment: 'Harassment',
  not_as_described: 'Not as described',
  inappropriate: 'Inappropriate content',
  spam: 'Spam',
  child_safety: 'Child safety',
  other: 'Something else',
};

/** After a report is sent. */
export const REPORT_THANKS = 'Thanks. We review every report.';

/** The BlockDialog's optional checkbox when a seeker blocks a host. */
export const ALSO_WITHDRAW = 'Also withdraw my applications to this host';

/** What an invite to a seeker who muted or blocked the host shows the host (spec 8.7). */
export const NOT_ACCEPTING_INVITES = 'Not accepting invites right now';

/** `/profile/privacy` with no blocks. */
export const NO_BLOCKS = "You haven't blocked anyone.";
