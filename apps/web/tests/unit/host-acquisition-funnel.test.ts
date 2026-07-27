/**
 * A NEW HOST MUST BE ABLE TO PAY.
 *
 * The defect this pins was a closed loop assembled from three changes that were
 * each correct on their own:
 *
 *   1. Migration 083 made create_my_host_profile refuse without a paid tier
 *      (founder: "no host can create a profile or publish for free").
 *   2. startHostCheckoutAction resolved getHostProfile() first and redirected
 *      ?error=host_profile_missing when there was none.
 *   3. The (host) layout redirects any profile-less user to /host/onboarding.
 *
 * Both checkout surfaces lived under that layout, so the route a new host had to
 * walk was: sign up -> /host/* -> onboarding -> "choose a plan first" -> the only
 * place to choose a plan -> onboarding. Production holds zero hosts and payments
 * switch on, so this was new-host revenue at zero on day one.
 *
 * COMMERCIAL REDESIGN D6 REMOVED THE FIRST OF THE THREE. Migration 086 lets a
 * signed-in prospect create a workspace with no plan, so the loop cannot form
 * from that end any more. Properties 2 and 3 are still load-bearing and still
 * asserted: paying must work for a host with no profile, because under D6 a host
 * may arrive at checkout from either direction — with a profile they built
 * first, or without one.
 *
 * The properties below are what make the funnel open, and each is asserted
 * against the thing that would close it again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    throw error;
  }),
);
const getHostProfileMock = vi.hoisted(() => vi.fn());
const getHostSubscriptionMock = vi.hoisted(() => vi.fn());
const createCheckoutSessionMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const clerkContactMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@explore-and-earn/db", () => ({
  getHostProfile: getHostProfileMock,
  getHostSubscriptionByClerkUserId: getHostSubscriptionMock,
}));
vi.mock("../../lib/clerkUser", () => ({ getClerkContact: clerkContactMock }));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: rateLimitMock,
}));
vi.mock("../../services/stripe", () => ({
  createCheckoutSession: createCheckoutSessionMock,
  createBillingPortalSession: vi.fn(),
  isBillingInterval: (v: string) => v === "monthly" || v === "yearly",
  isHostSubscriptionTier: (v: string) =>
    v === "starter" || v === "professional" || v === "enterprise",
}));

const { startHostCheckoutAction } = await import("../../app/actions/hostBilling");

function planForm(tier = "starter", interval = "monthly"): FormData {
  const form = new FormData();
  form.set("tier", tier);
  form.set("interval", interval);
  return form;
}

/** The URL a redirect() call was given, pulled back out of the thrown marker. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("expected a redirect, but the action returned normally");
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user_new",
    getToken: async () => "token",
  });
  rateLimitMock.mockResolvedValue({ allowed: true });
  clerkContactMock.mockResolvedValue({ email: "new@host.test", name: "New Host" });
  // The new host: signed up, no profile, no subscription.
  getHostProfileMock.mockResolvedValue(null);
  getHostSubscriptionMock.mockResolvedValue(null);
  createCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
});

// ── 1. Checkout is reachable with no host profile ──────────────────────────

describe("startHostCheckoutAction without a host profile", () => {
  it("reaches Stripe instead of redirecting to host_profile_missing", async () => {
    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toBe("https://checkout.stripe.test/s");
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: "user_new", subscriptionTier: "starter" }),
    );
  });

  it("keys the Stripe customer off the Clerk user, which exists from sign-up", async () => {
    await redirectedTo(() => startHostCheckoutAction(planForm()));

    const params = createCheckoutSessionMock.mock.calls[0][0] as {
      clerkUserId: string;
      companyName: string;
    };
    expect(params.clerkUserId).toBe("user_new");
    // The profile only ever supplied a display string for Stripe's submit
    // button, which is why requiring it bought nothing and cost everything.
    expect(typeof params.companyName).toBe("string");
    expect(params.companyName.length).toBeGreaterThan(0);
  });

  /**
   * The guard against a SECOND concurrent subscription has to survive the
   * profile going away, and host_profiles.subscription_tier cannot carry it for
   * a payer who has no profile row. host_subscriptions is keyed by Clerk id.
   */
  it("still refuses a second checkout for someone who already pays", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "professional",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_existing",
    });

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toContain("already_subscribed");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("does not mistake an absent subscription row for an active plan", async () => {
    getHostSubscriptionMock.mockResolvedValue(null);
    await redirectedTo(() => startHostCheckoutAction(planForm()));
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A RECOVERABLE lapse is recorded as tier 'none' — the webhook deliberately
   * suspends the entitlement without ending the Stripe subscription, because
   * paused / unpaid / past_due can all still collect. A tier-only guard
   * therefore saw "no plan" and opened checkout, stacking a SECOND concurrent
   * subscription the moment the first recovered. The way back for a lapsed
   * host is the billing portal, and the guard says so.
   */
  it.each(["unpaid", "paused", "past_due"])(
    "REFUSES checkout while a lapsed subscription (%s) can still recover",
    async (billingStatus) => {
      getHostSubscriptionMock.mockResolvedValue({
        tier: "none",
        billingStatus,
        currentPeriodEnd: null,
        stripeSubscriptionId: "sub_lapsed",
      });

      const destination = await redirectedTo(() =>
        startHostCheckoutAction(planForm()),
      );

      expect(destination).toContain("subscription_lapsed_use_portal");
      expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    },
  );

  /** A CANCELLED subscription is over — re-subscribing must keep working. */
  it("still lets a cancelled host buy a new plan", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "none",
      billingStatus: "cancelled",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_old",
    });

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toBe("https://checkout.stripe.test/s");
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });

  /**
   * BOTH return paths must be reachable by a payer with NO host profile. The
   * old success_url was /host/billing, whose (host) layout bounces exactly
   * that payer to onboarding before the entitlement webhook can land —
   * /host/checkout/complete confirms the session with Stripe directly. The
   * {CHECKOUT_SESSION_ID} placeholder is substituted by Stripe and must
   * survive un-encoded.
   */
  it("returns the payer to the ungated confirmation page, not the gated billing page", async () => {
    await redirectedTo(() => startHostCheckoutAction(planForm()));

    const params = createCheckoutSessionMock.mock.calls[0][0] as {
      successUrl: string;
      cancelUrl: string;
    };
    expect(params.successUrl).toContain(
      "/host/checkout/complete?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.successUrl).not.toContain("%7B");
    expect(params.cancelUrl).toContain("/host/plans");
    expect(params.cancelUrl).not.toContain("/host/billing");
  });

  // ── The guard fails CLOSED ───────────────────────────────────────────────

  /**
   * A READ FAILURE IS NOT EVIDENCE OF ABSENCE, and treating it as one is worth
   * real money. The call sites used to end in `.catch(() => null)`, so a
   * PostgREST error — or adminClient() throwing synchronously because
   * SUPABASE_SERVICE_ROLE_KEY is unset on the environment — read as "no
   * subscription" and opened checkout. An already-subscribed host would then
   * hold TWO concurrent Stripe subscriptions, and the upsert that follows
   * overwrites stripe_subscription_id: the first one keeps billing with nothing
   * in the database pointing at it, so no cancellation path can reach it.
   */
  it("REFUSES checkout when the subscription authority cannot be read", async () => {
    getHostSubscriptionMock.mockRejectedValue(new Error("connection reset"));

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toContain("subscription_check_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  /** The exact production shape: adminClient() throws before any await. */
  it("REFUSES checkout when the service-role key is missing", async () => {
    getHostSubscriptionMock.mockImplementation(() => {
      throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
    });

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toContain("subscription_check_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  /**
   * host_profiles carries the denormalized copy of the tier and feeds the same
   * guard, so a fault there refuses too. Its ABSENCE still does not — that is
   * the normal state of the host this funnel exists for, and the test above
   * ("reaches Stripe instead of redirecting to host_profile_missing") holds it.
   */
  it("REFUSES checkout when the host profile read faults", async () => {
    getHostProfileMock.mockRejectedValue(new Error("statement timeout"));

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toContain("subscription_check_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  // ── Failures land somewhere the host can read them ───────────────────────

  /**
   * /host/billing is inside the (host) route group, whose layout redirects any
   * user with no host_profiles row to /host/onboarding. Every ?error= raised
   * here was therefore handed to a page that bounced the exact user it was
   * raised for: the pre-profile payer saw onboarding and no explanation at all.
   * /host/plans is in (host-onboard), reachable with no profile, and renders
   * each code as a sentence.
   */
  it.each([
    ["invalid_plan", () => planForm("bogus")],
    ["rate_limited", () => planForm()],
    ["checkout_failed", () => planForm()],
  ] as const)("sends the %s failure to /host/plans, not /host/billing", async (
    code,
    form,
  ) => {
    if (code === "rate_limited") rateLimitMock.mockResolvedValue({ allowed: false });
    if (code === "checkout_failed") {
      createCheckoutSessionMock.mockRejectedValue(new Error("stripe down"));
    }

    const destination = await redirectedTo(() => startHostCheckoutAction(form()));

    expect(destination).toContain(code);
    expect(destination.startsWith("/host/plans?")).toBe(true);
    expect(destination).not.toContain("/host/billing");
  });

  it("routes the already-subscribed refusal to /host/plans too", async () => {
    getHostSubscriptionMock.mockResolvedValue({
      tier: "starter",
      billingStatus: "active",
      currentPeriodEnd: null,
      stripeSubscriptionId: "sub_1",
    });

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination.startsWith("/host/plans?")).toBe(true);
  });

  /**
   * A route-group assertion, because the group is the fix. Every error code the
   * action can raise must be a sentence on the page it now lands on; a code with
   * no case renders a blank page and is the same silence in a new location.
   */
  it("gives every checkout error code a message on the plans page", () => {
    const source = readFileSync(
      new URL(
        "../../app/[locale]/(host-onboard)/host/plans/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const action = readFileSync(
      new URL("../../app/actions/hostBilling.ts", import.meta.url),
      "utf8",
    );

    const codes = [...action.matchAll(/checkoutRedirect\("([a-z_]+)"\)/g)].map(
      (match) => match[1],
    );
    // authResult.error is passed through, not a literal, so both of its values
    // are named here explicitly.
    const allCodes = new Set([
      ...codes,
      "unauthenticated",
      "expired_session",
      "missing_checkout_url",
    ]);

    expect(allCodes.size).toBeGreaterThan(5);
    for (const code of allCodes) {
      expect(source).toContain(`case "${code}":`);
    }
  });

  it("still refuses an unauthenticated caller", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: async () => null });

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(planForm()),
    );

    expect(destination).toContain("unauthenticated");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});

// ── 2. The plan page is outside the profile gate ───────────────────────────

describe("the plan selection route", () => {
  const appDir = new URL("../../app/[locale]/", import.meta.url);

  /**
   * A ROUTE-GROUP assertion, because the group is the whole fix. The (host)
   * layout redirects every profile-less user to /host/onboarding; anything
   * inside it is unreachable for the host this page exists to serve. Moving the
   * file back under (host) is exactly how this regresses, and nothing else in
   * the test suite would notice.
   */
  it("lives in (host-onboard), NOT in the profile-gated (host) group", () => {
    const page = new URL("(host-onboard)/host/plans/page.tsx", appDir);
    expect(() => readFileSync(page, "utf8")).not.toThrow();

    const gated = new URL("(host)/host/plans/page.tsx", appDir);
    expect(() => readFileSync(gated, "utf8")).toThrow();
  });

  it("reads no host profile — there is none to read", () => {
    const source = readFileSync(
      new URL("(host-onboard)/host/plans/page.tsx", appDir),
      "utf8",
    );
    expect(source).not.toContain("getHostProfile");
    expect(source).not.toContain("cachedHostProfile");
  });

  /**
   * D12 MOVED THE CHECKOUT POST ONE SCREEN LATER, and this assertion moved with
   * it. The property being pinned has not changed — a signed-in host with no
   * profile must be able to reach Stripe — but the page that posts the action is
   * now /host/plans/activate, where the exact amount, the renewal, the
   * cancellation terms and what activates are stated first.
   *
   * The plans page is checked for the ROUTE rather than for the action name. It
   * still explains the move in its header comment, and a `toContain` on the
   * action name would be satisfied by that prose — a source pin that a comment
   * can satisfy is testing the comment.
   */
  it("hands the choice to the activation summary rather than straight to Stripe", () => {
    const source = readFileSync(
      new URL("(host-onboard)/host/plans/page.tsx", appDir),
      "utf8",
    );
    expect(source).toContain("/host/plans/activate?tier=");
    // The import is gone, not merely unused: the POST happens one page later.
    expect(source).not.toContain(
      'import { startHostCheckoutAction } from "../../../../actions/hostBilling"',
    );
  });

  it("posts the checkout action from the activation page, still with no profile read", () => {
    const source = readFileSync(
      new URL("(host-onboard)/host/plans/activate/page.tsx", appDir),
      "utf8",
    );
    expect(source).toContain("startHostCheckoutAction");
    expect(source).toContain("action={startHostCheckoutAction}");
    expect(source).not.toContain("getHostProfile");
    expect(source).not.toContain("cachedHostProfile");
  });

  /**
   * Same route-group constraint as the plans page, for the same reason: the
   * audience is people who may have no host profile row, and the (host) layout
   * bounces exactly them.
   */
  it("keeps the activation page in (host-onboard), outside the profile gate", () => {
    const page = new URL("(host-onboard)/host/plans/activate/page.tsx", appDir);
    expect(() => readFileSync(page, "utf8")).not.toThrow();

    const gated = new URL("(host)/host/plans/activate/page.tsx", appDir);
    expect(() => readFileSync(gated, "utf8")).toThrow();
  });

  /**
   * The (host) layout gates on a profile; the (host-onboard) layout gates on
   * being signed in. If the latter ever grew a profile check, the loop closes
   * again from the other end.
   */
  it("sits under a layout that gates on sign-in only", () => {
    const layout = readFileSync(new URL("(host-onboard)/layout.tsx", appDir), "utf8");
    expect(layout).toContain("optionalAuth");
    expect(layout).not.toContain("getHostProfile");
    expect(layout).not.toContain("cachedHostProfile");
  });

  /**
   * The checkout RETURN page has the same constraint as the plans page and for
   * the same reason: its whole audience is payers who do not have a profile
   * row yet. Inside (host) it would bounce the payer it exists to catch.
   */
  it("keeps the checkout return page in (host-onboard) too", () => {
    const page = new URL("(host-onboard)/host/checkout/complete/page.tsx", appDir);
    expect(() => readFileSync(page, "utf8")).not.toThrow();

    const gated = new URL("(host)/host/checkout/complete/page.tsx", appDir);
    expect(() => readFileSync(gated, "utf8")).toThrow();
  });
});

// ── 3. Onboarding has no dead end left to route around ─────────────────────

describe("host onboarding after the pre-billing host mode (D6)", () => {
  const onboardingUrl = new URL(
    "../../app/[locale]/(host-onboard)/host/onboarding/page.tsx",
    import.meta.url,
  );

  /**
   * THE REPLACED ASSERTION. This used to pin that a 'subscription_required'
   * refusal was routed to /host/plans — the best available answer while
   * migration 083 refused creation without a paid tier, because the host
   * genuinely could not proceed on that form.
   *
   * Migration 086 removed the refusal, so the fork is gone rather than
   * redirected. What is pinned now is the absence: a re-introduced bounce to
   * checkout at profile creation is exactly the regression D6 exists to prevent,
   * and it would otherwise land silently.
   */
  it("does not bounce a profile-creating host to checkout", () => {
    const source = readFileSync(onboardingUrl, "utf8");
    expect(source).not.toContain('result.error === "subscription_required"');
    expect(source).not.toContain('router.push("/host/plans")');
  });

  it("lands a newly created profile in the workspace", () => {
    const source = readFileSync(onboardingUrl, "utf8");
    expect(source).toContain('router.push("/host")');
  });
});

// ── 4. The build-first door (D6 / D7) ──────────────────────────────────────

describe("the browse-first path", () => {
  const appDir = new URL("../../app/[locale]/", import.meta.url);
  const plansSource = () =>
    readFileSync(new URL("(host-onboard)/host/plans/page.tsx", appDir), "utf8");

  /**
   * The conversion principle in one assertion: a host who wants to look before
   * paying must be able to, FROM the page that asks them to pay. Without this
   * the plans page is still a tollgate, whatever the database now permits.
   */
  it("offers a way past the plans page without paying", () => {
    const source = plansSource();
    expect(source).toContain("I just want to browse first");
  });

  /**
   * ONE href, not a fork, and the target is deliberate. /host is the (host)
   * layout, which redirects a profile-less user to /host/onboarding and renders
   * the workspace for everyone else — so this single link already means
   * "onboarding if you have none, your workspace if you do", without the plans
   * page reading a host profile (which the topology test above forbids).
   */
  it("points at /host so the (host) layout picks onboarding or the workspace", () => {
    const source = plansSource();
    expect(source).toContain('href="/host"');

    // Still true, and the reason the single href works at all.
    const layout = readFileSync(new URL("(host)/layout.tsx", appDir), "utf8");
    expect(layout).toContain('redirect("/host/onboarding")');
  });

  it("says the profile can be built before a plan is chosen", () => {
    const source = plansSource();
    expect(source).toContain(
      "You can build and preview your employer profile before choosing a",
    );
  });

  /**
   * The stale promise. "you'll set up your host profile straight after checkout"
   * described an order migration 086 removed; leaving it would tell a host that
   * paying is a prerequisite for the thing they can already do.
   */
  it("no longer claims the profile comes after checkout", () => {
    const source = plansSource();
    expect(source).not.toContain("straight after checkout");
    expect(source).not.toContain("Pick one to continue");
  });
});
