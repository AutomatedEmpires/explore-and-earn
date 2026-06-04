// Data Retention Windows — ADR-041 (contract mirror)
// MIRROR of ADR-041 (Locked) in the Architecture Decision Log. These windows
// drive the per-table retention/purge jobs (G28) and the public privacy-policy
// copy. Do NOT change a window without a new ADR.

export const RETENTION_SUBJECTS = [
  "analytics_events",
  "messages",
  "soft_deleted_records",
  "moderation_audit_logs",
  "travel_attachments",
  "account_pii",
  "financial_records",
] as const
export type RetentionSubject = (typeof RETENTION_SUBJECTS)[number]

/** What event the retention window is measured from. */
export type RetentionTrigger =
  | "ingestion"
  | "account_deletion"
  | "soft_delete"
  | "role_completion"
  | "record_creation"

/** What, if anything, survives the purge. */
export type RetentionResidue =
  | "aggregate_only"
  | "anonymized_analytics"
  | "none"

export interface RetentionRule {
  /** Reference point the window is measured from. */
  readonly trigger: RetentionTrigger
  /** Window length in days, when expressed in days (else null). */
  readonly days: number | null
  /** Window length in months, when expressed in months. */
  readonly months?: number
  /** What is kept after the purge. */
  readonly residue: RetentionResidue
  /** Verbatim ADR-041 intent. */
  readonly note: string
}

// 7 years expressed in days, used for legally-mandated retention.
const SEVEN_YEARS_DAYS = 7 * 365

export const RETENTION_POLICY = {
  analytics_events: {
    trigger: "ingestion",
    days: null,
    months: 24,
    residue: "aggregate_only",
    note: "Raw analytics events: 24 months, then aggregate-only.",
  },
  messages: {
    trigger: "account_deletion",
    days: 90,
    residue: "none",
    note: "Messages: account life plus 90 days after deletion.",
  },
  soft_deleted_records: {
    trigger: "soft_delete",
    days: 30,
    residue: "anonymized_analytics",
    note: "Soft-deleted records: 30-day recovery, then PII purge; anonymized analytics retained.",
  },
  moderation_audit_logs: {
    trigger: "record_creation",
    days: SEVEN_YEARS_DAYS,
    residue: "none",
    note: "Moderation and audit logs: 7 years.",
  },
  travel_attachments: {
    trigger: "role_completion",
    days: 90,
    residue: "none",
    note: "Travel attachments: purged 90 days after role completion.",
  },
  account_pii: {
    trigger: "account_deletion",
    days: 30,
    residue: "anonymized_analytics",
    note: "Account deletion: PII purged within 30 days.",
  },
  financial_records: {
    trigger: "account_deletion",
    days: SEVEN_YEARS_DAYS,
    residue: "none",
    note: "Financial records retained 7 years for tax and Stripe.",
  },
} as const satisfies Record<RetentionSubject, RetentionRule>
