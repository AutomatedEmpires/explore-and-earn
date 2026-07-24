"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHostProfile } from "@explore-and-earn/db";

import { getClerkContact } from "../../lib/clerkUser";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import {
  createBillingPortalSession,
  createCheckoutSession,
  isBillingInterval,
  isHostSubscriptionTier,
} from "../../services/stripe";

const BILLING_PATH = "/host/billing";

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

function billingRedirect(error: string): never {
  redirect(`${BILLING_PATH}?error=${encodeURIComponent(error)}`);
}

export async function startHostCheckoutAction(formData: FormData): Promise<never> {
  const tierValue = formData.get("tier");
  const intervalValue = formData.get("interval");

  if (typeof tierValue !== "string" || !isHostSubscriptionTier(tierValue)) {
    billingRedirect("invalid_plan");
  }

  if (typeof intervalValue !== "string" || !isBillingInterval(intervalValue)) {
    billingRedirect("invalid_interval");
  }

  const authResult = await resolveHostAuth();
  if (!authResult.ok) {
    billingRedirect(authResult.error);
  }

  // Rate limit: 10 checkout sessions per hour per host. Each submit creates a
  // real Stripe Checkout session; a legitimate host needs a handful at most.
  const checkoutLimit = await checkRateLimitDistributed(
    `host-checkout:${authResult.auth.userId}`,
    10,
    60 * 60 * 1000,
  );
  if (!checkoutLimit.allowed) {
    billingRedirect("rate_limited");
  }

  const hostProfile = await getHostProfile(
    authResult.auth.token,
    authResult.auth.userId,
  ).catch(() => null);
  if (!hostProfile) {
    billingRedirect("host_profile_missing");
  }

  // A host who ALREADY pays must never be sent through checkout again: Stripe
  // would happily create a second concurrent subscription and bill for both.
  // The billing page renders "Start monthly/annual" for all three tiers
  // regardless of the current plan, so this is reachable by simply clicking a
  // different tier. Plan changes belong in the billing portal, which prorates
  // and replaces rather than stacking.
  if (hostProfile.subscriptionTier !== "none") {
    billingRedirect("already_subscribed");
  }

  let checkoutUrl: string;
  try {
    const contact = await getClerkContact(authResult.auth.userId);
    const session = await createCheckoutSession({
      clerkUserId: authResult.auth.userId,
      customerEmail: contact.email,
      customerName: contact.name,
      companyName:
        hostProfile.companyName && hostProfile.companyName.trim().length > 0
          ? hostProfile.companyName
          : "Explore & Earn host",
      subscriptionTier: tierValue,
      billingInterval: intervalValue,
      successUrl: absoluteUrl(`${BILLING_PATH}?checkout=success`),
      cancelUrl: absoluteUrl(`${BILLING_PATH}?checkout=canceled`),
    });
    checkoutUrl = session.url ?? `${BILLING_PATH}?error=missing_checkout_url`;
  } catch (error) {
    console.error("[stripe] checkout session creation failed", error);
    billingRedirect("checkout_failed");
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