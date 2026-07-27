"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getFoundingHostProgram,
  getHostProfile,
  getHostSubscriptionByClerkUserId,
} from "@explore-and-earn/db";

import { resolveFoundingProgramView } from "../../components/founding/program";
import { getClerkContact } from "../../lib/clerkUser";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import {
  createBillingPortalSession,
  createCheckoutSession,
  hasFoundingCheckoutConfig,
  isBillingInterval,
  isHostSubscriptionTier,
} from "../../services/stripe";

const BILLING_PATH = "/host/billing";

/**
 * Where a FAILED checkout lands. Deliberately not /host/billing.
 *
 * /host/billing sits inside the (host) route group, whose layout redirects any
 * user without a host_profiles row to /host/onboarding. The whole point of the
 * pre-profile funnel is that a host pays BEFORE that row exists, so every
 * ?error= this action can raise was being handed to a page that bounced the
 * exact user it was raised for — the message never rendered, and the host saw
 * onboarding with no explanation of why checkout did not open.
 *
 * /host/plans is in (host-onboard), which gates on being signed in and nothing
 * else, and it renders every error code below as a sentence. A host who DOES
 * have a profile can reach it too, so this is the readable destination for both.
 *
 * The billing portal keeps BILLING_PATH: it is only reachable from /host/billing
 * in the first place, and /host/plans has nothing to say about a portal failure.
 */
const PLANS_PATH = "/host/plans";

interface HostAuth {
  userId: string;
  token: string;
}

async function resolveHostAuth(): Promise<
  { ok: true; auth: HostAuth } | { ok: false; error: string }
> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "unauthenticated" };
  }

  const token = await getToken();
  if (!token) {
    return { ok: false, error: "expired_session" };
  }

  return { ok: true, auth: { userId, token } };
}

function absoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "https://exploreandearn.com";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function checkoutRedirect(error: string): never {
  redirect(`${PLANS_PATH}?error=${encodeURIComponent(error)}`);
}

function billingRedirect(error: string): never {
  redirect(`${BILLING_PATH}?error=${encodeURIComponent(error)}`);
}

export async function startHostCheckoutAction(formData: FormData): Promise<never> {
  const tierValue = formData.get("tier");
  const intervalValue = formData.get("interval");
  // The activation page renders this field only when a seat is genuinely
  // claimable. That is a rendering decision and therefore not a guard — a form
  // field is whatever the sender says it is — so the request is re-checked
  // below against the same row the page read.
  const foundingRequested = formData.get("founding") === "1";

  if (typeof tierValue !== "string" || !isHostSubscriptionTier(tierValue)) {
    checkoutRedirect("invalid_plan");
  }

  if (typeof intervalValue !== "string" || !isBillingInterval(intervalValue)) {
    checkoutRedirect("invalid_interval");
  }

  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    checkoutRedirect(authResult.error);
  }

  // Rate limit: 10 checkout sessions per hour per host. Each submit creates a
  // real Stripe Checkout session; a legitimate host needs a handful at most.
  const checkoutLimit = await checkRateLimitDistributed(
    `host-checkout:${authResult.auth.userId}`,
    10,
    60 * 60 * 1000,
  );
  if (!checkoutLimit.allowed) {
    checkoutRedirect("rate_limited");
  }

  // NO HOST PROFILE IS REQUIRED TO PAY, and demanding one closed the funnel.
  //
  // The original defect: this action resolved getHostProfile() first and
  // redirected ?error=host_profile_missing when there was none, while the (host)
  // layout redirected every profile-less user to /host/onboarding — and, under
  // 083's creation gate, onboarding answered "choose a plan first". Both checkout
  // surfaces lived inside that layout, so the only way to choose a plan sent the
  // host back to the page telling them to choose a plan.
  //
  // COMMERCIAL REDESIGN D6 changed the order but not this requirement. Migration
  // 086 removed the creation gate, so a host may now arrive here having ALREADY
  // built a profile — and may equally arrive with none, straight from /host/plans
  // or from the pricing page. Both orders are supported, which is exactly why
  // this action must not require a profile in either direction.
  //
  // Nothing here ever needed the profile. createCheckoutSession is keyed by
  // clerkUserId, host_subscriptions is keyed by clerkUserId, and the Stripe
  // customer is resolved from clerkUserId metadata. The profile only supplied a
  // display string for Stripe's submit button.
  //
  // /host/plans (in the (host-onboard) group, outside the profile gate) is the
  // entry point that works with or without a profile; /host/billing remains the
  // in-workspace one.

  // A host who ALREADY pays must never be sent through checkout again: Stripe
  // would happily create a second concurrent subscription and bill for both.
  // Both plan surfaces render "Start monthly/annual" for all three tiers
  // regardless of the current plan, so this is reachable by simply clicking a
  // different tier. Plan changes belong in the billing portal, which prorates
  // and replaces rather than stacking.
  //
  // Read from host_subscriptions, not from host_profiles.subscription_tier: the
  // profile-less payer this action now serves has no row carrying that column,
  // and a guard that cannot see an existing subscription would let them buy a
  // second one.
  //
  // THE GUARD FAILS CLOSED, and that is the whole of it. Both reads used to end
  // in `.catch(() => null)`, so any fault — a PostgREST error, a dropped
  // connection, or adminClient() throwing synchronously because
  // SUPABASE_SERVICE_ROLE_KEY is unset on the environment — resolved to "no
  // subscription found" and opened checkout. An already-subscribed host would
  // get a SECOND concurrent Stripe subscription, and the upsert that follows
  // overwrites stripe_subscription_id: the first subscription keeps billing with
  // nothing in the database pointing at it, so no cancellation path can ever
  // reach it. A read failure is not evidence of absence. It refuses.
  //
  // A read that SUCCEEDS and finds no row is different, and still proceeds — no
  // row is exactly the state of a host who has never paid.
  let subscriptionTier: string | null = null;
  let billingStatus: string | null = null;
  let hostProfile: Awaited<ReturnType<typeof getHostProfile>> = null;
  let authorityUnavailable = false;

  try {
    const subscription = await getHostSubscriptionByClerkUserId(
      authResult.auth.userId,
    );
    subscriptionTier = subscription?.tier ?? null;
    billingStatus = subscription?.billingStatus ?? null;
  } catch (error) {
    console.error("[billing] host subscription read failed", error);
    authorityUnavailable = true;
  }

  // host_profiles carries the denormalized copy, which is the only record of a
  // tier granted before host_subscriptions existed. It feeds the same guard, so
  // it is read under the same rule: a fault refuses. Finding no profile is not a
  // fault — that is the normal state of the host this funnel was built for.
  if (!authorityUnavailable) {
    try {
      hostProfile = await getHostProfile(
        authResult.auth.token,
        authResult.auth.userId,
      );
    } catch (error) {
      console.error("[billing] host profile read failed", error);
      authorityUnavailable = true;
    }
  }

  if (authorityUnavailable) {
    checkoutRedirect("subscription_check_unavailable");
  }

  const currentTier = subscriptionTier ?? hostProfile?.subscriptionTier ?? "none";
  if (currentTier !== "none") {
    checkoutRedirect("already_subscribed");
  }

  // A paid tier is not the only thing that refuses. A subscription in a
  // RECOVERABLE lapse — paused, unpaid, past_due — is recorded as tier 'none'
  // by the webhook precisely because it is not paying right now, but the
  // Stripe subscription underneath it is still alive and can resume the moment
  // the host settles the open invoice. Opening a fresh checkout there stacks a
  // SECOND concurrent subscription on the same customer the moment the first
  // recovers, with the upsert overwriting which id backs the entitlement — the
  // exact double-billing this guard exists to prevent. The path back for a
  // lapsed host is the billing portal (pay what is owed, or cancel first), not
  // a second purchase. 'none' and 'cancelled' proceed: those are the states of
  // a host with no live subscription to stack on.
  const LIVE_BILLING_STATUSES: ReadonlySet<string> = new Set([
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "paused",
  ]);
  if (billingStatus && LIVE_BILLING_STATUSES.has(billingStatus)) {
    checkoutRedirect("subscription_lapsed_use_portal");
  }

  // THE EARLY-HOST RATE IS RE-AUTHORISED HERE, AGAINST THE DATABASE.
  //
  // Three things have to be true at the moment checkout OPENS, and the page that
  // rendered the button cannot vouch for any of them: a tab left open for an
  // hour, a bookmarked URL, or a hand-built POST all reach this line with the
  // form field set. So the program row is re-read and the same view logic the
  // page used decides again — status open, deadline in the future, a seat
  // actually remaining — and the six Stripe prices must all be provisioned.
  //
  // A REFUSAL IS A REFUSAL, NOT A FALLBACK. The alternative considered and
  // rejected was to quietly open a standard-rate checkout instead: the host was
  // shown one price, would be charged another, and would find out on their card
  // statement. Nothing about a closed programme entitles us to that.
  //
  // The read FAILS CLOSED for the same reason every entitlement read in this
  // file does — getFoundingHostProgram answers null on a fault, which resolves
  // to the unconfigured view, which is not claimable.
  if (foundingRequested) {
    const view = resolveFoundingProgramView(await getFoundingHostProgram());
    if (!view.claimable || !hasFoundingCheckoutConfig()) {
      checkoutRedirect("founding_unavailable");
    }
  }

  let checkoutUrl: string;
  try {
    const contact = await getClerkContact(authResult.auth.userId);
    const session = await createCheckoutSession({
      clerkUserId: authResult.auth.userId,
      customerEmail: contact.email,
      customerName: contact.name,
      companyName:
        hostProfile?.companyName && hostProfile.companyName.trim().length > 0
          ? hostProfile.companyName
          : "Explore & Earn host",
      subscriptionTier: tierValue,
      billingInterval: intervalValue,
      // Carried into the session metadata as foundingHost, which is what the
      // grant path reads before consuming a seat. createCheckoutSession THROWS
      // rather than falling back if the founding price is unprovisioned, so the
      // catch below sends the host to a readable failure instead of a surprise
      // charge at the standard rate.
      founding: foundingRequested,
      // BOTH return paths must be reachable by a payer with NO host profile —
      // the (host) layout bounces profile-less users, and Stripe does not
      // guarantee the entitlement webhook lands before the browser follows
      // success_url. /host/checkout/complete confirms the session with Stripe
      // directly and applies the same idempotent grant the webhook applies,
      // so the payer is routed by what is true rather than by which race was
      // won. The {CHECKOUT_SESSION_ID} placeholder is substituted by Stripe
      // and must not be URL-encoded.
      successUrl: absoluteUrl(
        "/host/checkout/complete?session_id={CHECKOUT_SESSION_ID}",
      ),
      cancelUrl: absoluteUrl(`${PLANS_PATH}?error=checkout_canceled`),
    });
    checkoutUrl = session.url ?? `${PLANS_PATH}?error=missing_checkout_url`;
  } catch (error) {
    console.error("[stripe] checkout session creation failed", error);
    checkoutRedirect("checkout_failed");
  }

  // redirect() signals via a thrown NEXT_REDIRECT error, so it MUST run outside
  // the try/catch above — otherwise the success redirect is swallowed by the
  // catch and the host is sent to ?error=checkout_failed instead of Stripe.
  revalidatePath(BILLING_PATH);
  redirect(checkoutUrl);
}

export async function startHostBillingPortalAction(): Promise<never> {
  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    billingRedirect(authResult.error);
  }

  // Rate limit: 10 portal sessions per hour per host (same budget shape as
  // checkout — every call mints a real Stripe billing-portal session).
  const portalLimit = await checkRateLimitDistributed(
    `host-billing-portal:${authResult.auth.userId}`,
    10,
    60 * 60 * 1000,
  );
  if (!portalLimit.allowed) {
    billingRedirect("rate_limited");
  }

  let portalUrl: string;
  try {
    const contact = await getClerkContact(authResult.auth.userId);
    const session = await createBillingPortalSession({
      clerkUserId: authResult.auth.userId,
      customerEmail: contact.email,
      returnUrl: absoluteUrl(BILLING_PATH),
    });
    portalUrl = session.url;
  } catch (error) {
    console.error("[stripe] billing portal session creation failed", error);
    billingRedirect("portal_unavailable");
  }

  // redirect() throws NEXT_REDIRECT by design — keep it outside the try/catch
  // so a successful portal session is not swallowed into ?error=portal_unavailable.
  redirect(portalUrl);
}