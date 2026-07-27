import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getHostProfile,
  getHostSubscriptionByClerkUserId,
} from "@explore-and-earn/db";

import { optionalAuth } from "../../../../../../lib/optionalAuth";
import { confirmCheckoutSessionForUser } from "../../../../../../services/stripe";
import { AutoRefresh } from "./AutoRefresh";
import styles from "./page.module.css";

/**
 * Where Stripe Checkout RETURNS a payer, and the page that closes the race the
 * old success_url lost.
 *
 * The old success_url was /host/billing, which sits in the (host) group: its
 * layout redirects any user without a host_profiles row to onboarding, and
 * onboarding sends the un-entitled back to plan selection. Stripe does not
 * guarantee the entitlement webhook finishes before the browser follows
 * success_url — so the first thing a brand-new PAYING host could see was a
 * bounce back to "choose a plan", seconds after choosing one.
 *
 * This page sits in (host-onboard) — signed-in is its only gate, exactly like
 * /host/plans — and does not wait for the webhook: it confirms the session
 * with Stripe directly and applies the same idempotent grant the webhook
 * applies (confirmCheckoutSessionForUser), then routes by what actually
 * exists: profile holders to billing, new hosts to onboarding.
 */
export const metadata: Metadata = { title: "Finishing your checkout" };
export const dynamic = "force-dynamic";

type CompleteSearchParams = { session_id?: string };

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<CompleteSearchParams>;
}) {
  const params = await searchParams;
  const sessionId =
    typeof params.session_id === "string" && params.session_id.length > 0
      ? params.session_id
      : null;

  const { userId, getToken } = await optionalAuth();
  if (!userId || !sessionId) {
    redirect("/host/plans");
  }

  // The webhook may already have granted — the cheapest check first, which
  // also covers a refresh of this page after the grant landed.
  let entitled = false;
  try {
    const subscription = await getHostSubscriptionByClerkUserId(userId);
    entitled = (subscription?.tier ?? "none") !== "none";
  } catch {
    // An unreadable authority is indistinguishable from "not yet" here, and
    // the session confirmation below is the authoritative attempt either way.
  }

  let pendingPayment = false;
  if (!entitled) {
    const confirmation = await confirmCheckoutSessionForUser(sessionId, userId);
    if (confirmation.outcome === "not_yours") {
      redirect("/host/plans");
    }
    entitled = confirmation.outcome === "granted";
    pendingPayment = confirmation.outcome === "pending_payment";
  }

  if (entitled) {
    // Routing only — a profile read fault here must not strand an entitled
    // payer, and the worst a wrong guess costs is one extra redirect: the
    // (host) layout bounces a profile-less user to onboarding on its own.
    const token = getToken ? await getToken() : null;
    const profile = token
      ? await getHostProfile(token, userId).catch(() => null)
      : null;
    redirect(profile ? "/host/billing?checkout=success" : "/host/onboarding");
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
        {pendingPayment ? (
          <>
            <h1 className={styles.title}>Your payment is on its way</h1>
            <p className={styles.subtitle}>
              Your bank is still confirming the payment — that can take a few
              business days for bank-debit methods. Your plan activates the
              moment it clears, and this page will move you along once it has.
              Nothing more is needed from you.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Finishing your checkout…</h1>
            <p className={styles.subtitle}>
              Your payment went through and we&apos;re activating your plan.
              This usually takes a few seconds — the page refreshes itself.
            </p>
            <AutoRefresh everyMs={3000} />
          </>
        )}
      </section>
    </main>
  );
}
