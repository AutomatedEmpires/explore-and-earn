import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";

/**
 * Subscription state keyed by CLERK USER ID (migration 083).
 *
 * host_profiles.subscription_tier cannot carry this fact on its own: it is a
 * column on the very row a paid host does not have yet. A customer who pays
 * before onboarding matched zero rows in the old
 * `UPDATE host_profiles ... WHERE clerk_user_id = ...` sync, so the money landed
 * and nothing recorded it. public.host_subscriptions exists from sign-up onward
 * and is what create_my_host_profile reads.
 *
 * Written only under the service role — `authenticated` holds SELECT on four
 * columns of this table and nothing else, because a host who could write it
 * could award themselves a plan.
 */

export type HostSubscriptionTierValue =
  | "none"
  | "starter"
  | "professional"
  | "enterprise";

export type HostBillingStatusValue =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "unpaid"
  | "paused";

export interface UpsertHostSubscriptionInput {
  readonly clerkUserId: string;
  readonly tier: HostSubscriptionTierValue;
  readonly billingStatus?: HostBillingStatusValue;
  readonly stripeCustomerId?: string | null;
  readonly stripeSubscriptionId?: string | null;
  readonly currentPeriodEnd?: string | null;
}

/**
 * Record the authoritative subscription state for a Clerk user.
 *
 * `billingStatus` defaults from the tier rather than being invented: the webhook
 * already collapses every status outside active/trialing/past_due to tier
 * 'none', so a tier of 'none' means the subscription is not currently paying.
 * Stripe identifiers are only written when supplied, so a later event that lacks
 * them cannot erase what an earlier one recorded.
 */
export async function upsertHostSubscription(
  input: UpsertHostSubscriptionInput,
): Promise<void> {
  if (!input.clerkUserId) return;

  const db = adminClient() as unknown as SupabaseClient;

  const row: Record<string, unknown> = {
    clerk_user_id: input.clerkUserId,
    tier: input.tier,
    billing_status:
      input.billingStatus ?? (input.tier === "none" ? "none" : "active"),
    updated_at: new Date().toISOString(),
  };
  if (input.stripeCustomerId) row.stripe_customer_id = input.stripeCustomerId;
  if (input.stripeSubscriptionId) {
    row.stripe_subscription_id = input.stripeSubscriptionId;
  }
  if (input.currentPeriodEnd) row.current_period_end = input.currentPeriodEnd;

  const { error } = await db
    .from("host_subscriptions")
    .upsert(row, { onConflict: "clerk_user_id" });

  if (error) {
    throw new Error(`upsertHostSubscription: ${error.message}`);
  }
}

export interface HostSubscriptionState {
  readonly tier: HostSubscriptionTierValue;
  readonly billingStatus: HostBillingStatusValue;
  readonly currentPeriodEnd: string | null;
  /**
   * The Stripe subscription this row's entitlement came from, or null for a row
   * written before the id was recorded. The webhook compares it against the
   * subscription in a cancellation event before revoking anything — see
   * syncSubscriptionEvent. Read under the service role only; `authenticated`
   * holds SELECT on four columns of this table and this is not one of them.
   */
  readonly stripeSubscriptionId: string | null;
}

/**
 * Read a Clerk user's subscription state under the service role.
 *
 * Returns null when no row exists — which is the state of every user who has not
 * completed checkout, and therefore means "not entitled", not "unknown".
 *
 * THROWS on a read failure, and callers must not flatten that into null. An
 * error means the authority could not be consulted, which is not the same fact
 * as "this user has no subscription"; treating the two alike is what let an
 * already-subscribed host open a second concurrent Stripe subscription.
 */
export async function getHostSubscriptionByClerkUserId(
  clerkUserId: string,
): Promise<HostSubscriptionState | null> {
  if (!clerkUserId) return null;

  const db = adminClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_subscriptions")
    .select("tier, billing_status, current_period_end, stripe_subscription_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) throw new Error(`getHostSubscriptionByClerkUserId: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    tier: (row.tier as HostSubscriptionTierValue) ?? "none",
    billingStatus: (row.billing_status as HostBillingStatusValue) ?? "none",
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
  };
}

/**
 * Bring a host's live inventory back inside the allowance their plan actually
 * grants, closing the excess.
 *
 * WHY THIS EXISTS. The enforcement trigger (083) only fires on a write to
 * `listings`. A host whose subscription lapses writes nothing, so their listings
 * stayed live on a plan that no longer pays for them — the "downgrade and keep
 * everything live" bypass 083's own header claimed to have closed. The trigger
 * cannot close it; only something that runs when the SUBSCRIPTION changes can,
 * and this is that something.
 *
 * WHAT THIS WRAPPER COVERS, stated exactly. An earlier version of this comment
 * said "called after every subscription state write", and that was only ever
 * half the allowance. The allowance has two terms:
 *
 *   * the PLAN term, from host_subscriptions — this wrapper, called by
 *     syncHostSubscriptionTier on every plan grant, downgrade, non-payment and
 *     cancellation;
 *   * the ADD-ON term, host_profiles.purchased_listing_slots — swept inside
 *     migration 085's credit / revoke / sync functions, the only writers of that
 *     column. It is NOT covered by this wrapper and must not be: the add-on
 *     branch of syncSubscriptionEvent returns before syncHostSubscriptionTier is
 *     ever reached, which is precisely how a cancelled add-on used to leave four
 *     public listings standing against an allowance of one.
 *
 * On a plan grant this is a no-op by construction: a host inside their allowance
 * has no excess to close.
 *
 * Returns the number of listings closed, which is 0 in the overwhelming majority
 * of calls.
 */
export async function closeHostListingsOverAllowance(
  clerkUserId: string,
): Promise<number> {
  if (!clerkUserId) return 0;

  const db = adminClient() as unknown as SupabaseClient;
  const { data, error } = await db.rpc("close_host_listings_over_allowance", {
    p_clerk_user_id: clerkUserId,
  });

  if (error) {
    throw new Error(`closeHostListingsOverAllowance: ${error.message}`);
  }

  return typeof data === "number" ? data : 0;
}
