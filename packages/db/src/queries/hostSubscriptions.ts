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
}

/**
 * Read a Clerk user's subscription state under the service role.
 *
 * Returns null when no row exists — which is the state of every user who has not
 * completed checkout, and therefore means "not entitled", not "unknown".
 */
export async function getHostSubscriptionByClerkUserId(
  clerkUserId: string,
): Promise<HostSubscriptionState | null> {
  if (!clerkUserId) return null;

  const db = adminClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_subscriptions")
    .select("tier, billing_status, current_period_end")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) throw new Error(`getHostSubscriptionByClerkUserId: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    tier: (row.tier as HostSubscriptionTierValue) ?? "none",
    billingStatus: (row.billing_status as HostBillingStatusValue) ?? "none",
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
  };
}
