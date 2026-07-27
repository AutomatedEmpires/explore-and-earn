import type { Metadata } from "next";
import {
  getFoundingHostProgram,
  getOpenFoundingClaimDiscrepancies,
} from "@explore-and-earn/db";

import { FoundingProgramConsole } from "../../../../../components/admin/FoundingProgramConsole";
import { hasFoundingCheckoutConfig } from "../../../../../services/stripe";
import styles from "../../shared.module.css";

export const metadata: Metadata = {
  title: "Early-host programme",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /admin/founding — where the early-host programme is turned on.
 *
 * The whole programme ships DARK: migration 087 seeds no row, the public section
 * renders one qualitative sentence, the claim function refuses every seat, and
 * checkout refuses the discounted rate. This page is the only thing that changes
 * any of that, and it is gated by the (admin) layout's env allow-list with the
 * server action re-verifying the caller independently.
 *
 * The discrepancy list below is the other half of the honesty contract. A
 * checkout opened while places remained can settle after the last one is gone;
 * the paid tier is granted anyway (the money arrived against a valid plan price)
 * and the over-subscription is recorded rather than silently absorbed into the
 * count. If rows appear here, real people paid expecting an early-host rate that
 * the programme could not honour, and somebody has to decide what to do about
 * it — which is why they are listed on the page that owns the programme rather
 * than only in an error tracker.
 */
export default async function AdminFoundingProgramPage() {
  const [program, discrepancies] = await Promise.all([
    getFoundingHostProgram(),
    getOpenFoundingClaimDiscrepancies(),
  ]);

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Early-host programme</h1>
        <p className={styles.subtitle}>
          Until a capacity, a closing date and an open status are saved here, no
          public surface shows a count, a remainder or a countdown, and checkout
          will not charge the discounted rate. That is deliberate: a programme
          whose numbers nobody chose is a fabricated one.
        </p>
      </header>

      <FoundingProgramConsole
        capacity={program?.capacity ?? 0}
        claimed={program?.claimed ?? 0}
        enrollmentDeadline={program?.enrollmentDeadline ?? null}
        status={program?.status ?? "draft"}
        checkoutReady={hasFoundingCheckoutConfig()}
      />

      <section aria-labelledby="discrepancies-title">
        <h2 id="discrepancies-title" className={styles.title}>
          Places paid for but not granted
        </h2>
        {discrepancies.length === 0 ? (
          <p className={styles.subtitle}>
            None. Every paid early-host checkout has been matched to a place.
          </p>
        ) : (
          <ul>
            {discrepancies.map((entry) => (
              <li key={entry.id}>
                {entry.clerkUserId} — refused as <strong>{entry.reason}</strong>{" "}
                {entry.stripeCheckoutSessionId
                  ? `(session ${entry.stripeCheckoutSessionId})`
                  : ""}{" "}
                on {entry.notedAt}. The plan was granted; the discounted rate was
                not.
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
