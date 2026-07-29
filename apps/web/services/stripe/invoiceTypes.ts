/**
 * Invoice view types, split out from the Stripe service.
 *
 * `services/stripe/index.ts` constructs a live Stripe client and reaches for
 * the service-role database helpers at import time, so anything that merely
 * needs the SHAPE of an invoice cannot import from it — a pure formatter or a
 * unit test would drag the whole client in with it. The types live here; the
 * service re-exports them, so callers still have one obvious import site.
 */

/** One row of billing history, as the host's Billing page renders it. */
export interface HostInvoiceSummary {
  readonly id: string;
  /** Stripe's human invoice number, when it has issued one. */
  readonly number: string | null;
  /** Unix seconds. Formatted by the caller, in the reader's locale. */
  readonly createdAt: number;
  readonly amountPaidCents: number;
  readonly currency: string;
  readonly status: string;
  /** Stripe-hosted receipt. Absent on some statuses; never fabricated. */
  readonly hostedInvoiceUrl: string | null;
  readonly invoicePdfUrl: string | null;
}

export interface HostInvoiceListResult {
  readonly ok: boolean;
  readonly invoices: readonly HostInvoiceSummary[];
  readonly error?: string;
}
