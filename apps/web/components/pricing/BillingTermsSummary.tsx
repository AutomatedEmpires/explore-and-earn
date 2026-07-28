import Link from "next/link";
import { ANNUAL_MONTHS_BILLED } from "@explore-and-earn/contracts";

import styles from "./billingTerms.module.css";

/**
 * Renewal, cancellation, and what activation actually does — on the page that
 * asks for the decision (spec D21).
 *
 * THESE FACTS EXISTED, ONE SCREEN TOO LATE. The activation summary states the
 * exact amount due, the renewal cadence and the cancellation terms, and it is
 * right that it does — but a host deciding BETWEEN plans was making that
 * decision without knowing whether there was a minimum term or what happens to
 * their work if they stop paying. The two most common reasons not to buy were
 * unanswerable on the page that asked.
 *
 * NO AMOUNT APPEARS HERE, deliberately. Every figure that depends on the chosen
 * tier lives one screen forward, where a tier has been chosen and the number can
 * be exact; ANNUAL_MONTHS_BILLED is the one contract constant this needs, and it
 * is read rather than typed. A summary that quoted a price it had to guess at
 * would be the drift the pricing guardrail exists to stop.
 */

interface Term {
  readonly id: string;
  readonly term: string;
  readonly detail: string;
}

const TERMS: readonly Term[] = [
  {
    id: "renewal",
    term: "Renewal",
    detail:
      "Plans renew automatically at the same rate — monthly, or once every twelve months on annual — until you cancel. There is no minimum term on either.",
  },
  {
    id: "annual",
    term: "How annual works",
    detail: `Annual billing is exactly ${ANNUAL_MONTHS_BILLED} monthly payments taken once a year, which is two months free. It is not a percentage discount and there is nothing to lock into.`,
  },
  {
    id: "cancelling",
    term: "Cancelling",
    detail:
      "Cancel any time from your billing settings. Your plan runs to the end of the period you have already paid for, and nothing is pro-rated away from you.",
  },
  {
    id: "after",
    term: "If you stop paying",
    detail:
      "Your listings stop being discoverable and your workspace returns to the build-and-draft state. Nothing is deleted: your profile, your roles, your applicants and your messages are all still there when you come back.",
  },
  {
    id: "payment",
    term: "Who takes the payment",
    detail:
      "Stripe, on their own checkout page. Card details are entered there and never reach Explore & Earn.",
  },
];

const ACTIVATION: readonly string[] = [
  "Your existing drafts become publishable immediately — nothing is queued for approval.",
  "Published roles appear in Seek, Swipe and Map and start receiving applications.",
  "Applicants arrive with a match score, in a pipeline with stages.",
  "Messaging opens on each application, and your analytics start filling.",
];

export function BillingTermsSummary() {
  return (
    <section className={styles.section} aria-labelledby="billing-terms-title">
      <div className={styles.head}>
        <h2 id="billing-terms-title" className={styles.title}>
          Before you decide
        </h2>
        <p className={styles.lead}>
          The terms are the same on every plan. The exact amount due is stated on
          the next screen, once you have picked one.
        </p>
      </div>

      <div className={styles.columns}>
        <dl className={styles.terms}>
          {TERMS.map((entry) => (
            <div key={entry.id} className={styles.termRow}>
              <dt>{entry.term}</dt>
              <dd>{entry.detail}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.activation}>
          <h3 className={styles.activationTitle}>
            What activating changes, the moment it lands
          </h3>
          <ol className={styles.activationList}>
            {ACTIVATION.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className={styles.refunds}>
            Refunds are reviewed against the actual charge —{" "}
            <Link className={styles.inlineLink} href="/refunds">
              how refunds work
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
