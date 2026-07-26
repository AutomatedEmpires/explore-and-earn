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
 * The three properties below are what make the funnel open, and each is asserted
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
    expect(source).toContain("startHostCheckoutAction");
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
});

// ── 3. Onboarding sends an unpaid host somewhere they can act ──────────────

describe("host onboarding's dead end", () => {
  it("routes a subscription_required refusal to the plans page", () => {
    const source = readFileSync(
      new URL("../../app/[locale]/(host-onboard)/host/onboarding/page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('result.error === "subscription_required"');
    expect(source).toContain('router.push("/host/plans")');
  });
});
