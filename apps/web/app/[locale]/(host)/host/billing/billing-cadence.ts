import { FOUNDER_LOCKED_PRICING } from "@explore-and-earn/contracts";

import type { HostInvoiceSummary } from "../../../../../services/stripe/invoiceTypes";

/**
 * Billing cadence, read from the most recent PAID invoice rather than guessed.
 *
 * `host_subscriptions` stores no interval, so the honest options were to omit
 * cadence or to source it from something real. An invoice amount that exactly
 * equals the tier's monthly or annual figure in the pricing contract identifies
 * the cadence; an amount that matches neither — a proration, an add-on, a
 * discounted rate — returns null instead of picking the nearer one.
 *
 * IN ITS OWN MODULE so it can be unit-tested. The billing page imports
 * @explore-and-earn/db, whose entry point pulls in "server-only" and therefore
 * cannot be loaded by a test runner. A pure rule about money that no test can
 * execute is the wrong trade.
 */
export function cadenceFromInvoices(
  tier: string,
  invoices: readonly HostInvoiceSummary[],
): "monthly" | "annual" | null {
  const pricing =
    FOUNDER_LOCKED_PRICING[tier as keyof typeof FOUNDER_LOCKED_PRICING];
  if (!pricing) return null;
  const paid = invoices.filter(
    (invoice) => invoice.status === "paid" && invoice.amountPaidCents > 0,
  );
  for (const invoice of paid) {
    if (invoice.amountPaidCents === pricing.monthly) return "monthly";
    if (invoice.amountPaidCents === pricing.yearly) return "annual";
  }
  return null;
}
