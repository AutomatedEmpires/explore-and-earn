/**
 * THE EARLY-HOST PROGRAMME MUST BE DARK UNTIL SOMEBODY CHOOSES ITS NUMBERS.
 *
 * The estate promise audit of 2026-07-17 named this the one finding that becomes
 * unfixable once it works: a discounted rate offered to the first N hosts, with
 * a lifetime lock and a forfeiture clause, and no code anywhere that counted a
 * claim, held a capacity or knew a deadline. Commercial redesign D10 makes it
 * real, and "real" has a precise meaning that this file pins:
 *
 *   1. NOTHING QUANTITATIVE UNTIL CONFIGURED. No row, or a draft row, renders no
 *      capacity, no remainder, no deadline and no countdown.
 *   2. THE PAGE AND THE DATABASE AGREE. A view is only 'open' when the claim
 *      function would actually grant a place — status open, deadline in the
 *      future, a place left. A page offering a place the server declines is
 *      worse than a page offering nothing.
 *   3. CHECKOUT RE-AUTHORISES. A form field is whatever the sender says it is,
 *      so the discounted rate is re-checked against the row when checkout opens,
 *      and a refusal is a refusal — never a quiet fallback to the full price.
 *
 * The grant path is pinned next door in founding-host-webhook.test.ts (it needs
 * the REAL services/stripe, which this file mocks). The database half — the
 * claim function's own refusals, the column grants and the idempotency — is
 * proved against a real database in
 * tools/db-assert/sql/assert_founding_host_program.sql.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveFoundingProgramView,
  type FoundingProgramRow,
} from "../../components/founding/program";

vi.mock("server-only", () => ({}));

// ── 1. The view: dark by default ───────────────────────────────────────────

const NOW = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = "2026-09-01T12:00:00.000Z";
const PAST = "2026-07-01T12:00:00.000Z";

function row(overrides: Partial<FoundingProgramRow> = {}): FoundingProgramRow {
  return {
    capacity: 100,
    claimed: 12,
    enrollmentDeadline: FUTURE,
    status: "open",
    ...overrides,
  };
}

describe("the programme renders nothing quantitative until it is configured", () => {
  /** The state production ships in: migration 087 seeds no row. */
  it("treats an absent programme as unconfigured, with no figures at all", () => {
    const view = resolveFoundingProgramView(null, NOW);
    expect(view.state).toBe("unconfigured");
    expect(view.counts).toBeNull();
    expect(view.deadlineIso).toBeNull();
    expect(view.claimable).toBe(false);
  });

  /**
   * Draft is the founder's staging state. It exists so a capacity and a date can
   * be typed in and reviewed before anyone sees them, which only works if draft
   * is indistinguishable from no row at all.
   */
  it("renders a draft programme exactly as it renders no programme", () => {
    const view = resolveFoundingProgramView(row({ status: "draft" }), NOW);
    expect(view.state).toBe("unconfigured");
    expect(view.counts).toBeNull();
    expect(view.deadlineIso).toBeNull();
  });

  it("has no state in which a count exists while the programme is unconfigured", () => {
    for (const candidate of [null, row({ status: "draft" })]) {
      const view = resolveFoundingProgramView(candidate, NOW);
      if (view.state === "unconfigured") expect(view.counts).toBeNull();
    }
  });
});

// ── 2. The view agrees with what the database would do ─────────────────────

describe("the view is only open when a place could actually be claimed", () => {
  it("reports the real figures when the programme is genuinely open", () => {
    const view = resolveFoundingProgramView(row(), NOW);
    expect(view.state).toBe("open");
    expect(view.counts).toEqual({ capacity: 100, claimed: 12, remaining: 88 });
    expect(view.deadlineIso).toBe(new Date(FUTURE).toISOString());
    expect(view.claimable).toBe(true);
  });

  /**
   * The claim function refuses a deadline that has passed, so a page that still
   * showed a countdown would be advertising a place the server declines.
   */
  it("is not open once the deadline has passed, whatever the status column says", () => {
    const view = resolveFoundingProgramView(
      row({ enrollmentDeadline: PAST }),
      NOW,
    );
    expect(view.state).toBe("ended");
    expect(view.claimable).toBe(false);
    expect(view.deadlineIso).toBeNull();
  });

  /**
   * An UNSET deadline is a decision the founder has not made, not "no deadline".
   * The claim function reads it the same way.
   */
  it("is not open with no deadline configured", () => {
    const view = resolveFoundingProgramView(
      row({ enrollmentDeadline: null }),
      NOW,
    );
    expect(view.state).toBe("ended");
    expect(view.claimable).toBe(false);
  });

  it("is not open with a capacity of zero", () => {
    const view = resolveFoundingProgramView(row({ capacity: 0, claimed: 0 }), NOW);
    expect(view.claimable).toBe(false);
  });

  it("reads a full programme as full, and stops offering a place", () => {
    const view = resolveFoundingProgramView(
      row({ capacity: 10, claimed: 10 }),
      NOW,
    );
    expect(view.state).toBe("full");
    expect(view.counts).toEqual({ capacity: 10, claimed: 10, remaining: 0 });
    expect(view.claimable).toBe(false);
    // No countdown on a programme nobody can join.
    expect(view.deadlineIso).toBeNull();
  });

  it("never produces a negative remainder from a bad row", () => {
    const view = resolveFoundingProgramView(row({ capacity: 5, claimed: 9 }), NOW);
    expect(view.counts?.remaining).toBe(0);
    expect(view.claimable).toBe(false);
  });

  /** The boundary the countdown sits on: a deadline that passes mid-session. */
  it("closes exactly at the deadline, not after it", () => {
    const atDeadline = new Date(FUTURE);
    expect(resolveFoundingProgramView(row(), atDeadline).claimable).toBe(false);
    expect(
      resolveFoundingProgramView(row(), new Date(atDeadline.getTime() - 1000))
        .claimable,
    ).toBe(true);
  });
});

// ── 3. Checkout re-authorises the discounted rate ──────────────────────────

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const getFoundingProgramMock = vi.hoisted(() => vi.fn());
const createCheckoutSessionMock = vi.hoisted(() => vi.fn());
const hasFoundingConfigMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@explore-and-earn/db", () => ({
  getHostProfile: vi.fn(async () => null),
  getHostSubscriptionByClerkUserId: vi.fn(async () => null),
  getFoundingHostProgram: getFoundingProgramMock,
}));
vi.mock("../../lib/clerkUser", () => ({
  getClerkContact: vi.fn(async () => ({ email: "a@b.test", name: "A" })),
}));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../../services/stripe", () => ({
  createCheckoutSession: createCheckoutSessionMock,
  createBillingPortalSession: vi.fn(),
  hasFoundingCheckoutConfig: hasFoundingConfigMock,
  isBillingInterval: (v: string) => v === "monthly" || v === "yearly",
  isHostSubscriptionTier: (v: string) =>
    v === "starter" || v === "professional" || v === "enterprise",
}));

const { startHostCheckoutAction } = await import("../../app/actions/hostBilling");

function form(founding: boolean): FormData {
  const data = new FormData();
  data.set("tier", "starter");
  data.set("interval", "monthly");
  if (founding) data.set("founding", "1");
  return data;
}

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
  authMock.mockResolvedValue({ userId: "user_1", getToken: async () => "t" });
  createCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.test/s" });
  hasFoundingConfigMock.mockReturnValue(true);
  getFoundingProgramMock.mockResolvedValue(row());
});

describe("startHostCheckoutAction and the discounted rate", () => {
  it("carries the discount only when the row says a place is claimable", async () => {
    await redirectedTo(() => startHostCheckoutAction(form(true)));

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ founding: true, subscriptionTier: "starter" }),
    );
  });

  it("never carries it on an ordinary checkout", async () => {
    await redirectedTo(() => startHostCheckoutAction(form(false)));

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ founding: false }),
    );
  });

  /**
   * The shipped state. No programme row means no discounted checkout, and the
   * refusal must be a refusal — the alternative considered and rejected was to
   * quietly open a standard-rate checkout, which shows a host one price and
   * charges another. It is also what happens on a READ FAULT, because
   * getFoundingHostProgram answers null rather than guessing.
   */
  it("REFUSES a discounted checkout when no programme is configured or readable", async () => {
    getFoundingProgramMock.mockResolvedValue(null);

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(form(true)),
    );

    expect(destination).toContain("founding_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a draft programme", row({ status: "draft" })],
    ["an ended programme", row({ status: "ended" })],
    ["a full programme", row({ capacity: 4, claimed: 4 })],
    ["a passed deadline", row({ enrollmentDeadline: PAST })],
    ["no deadline at all", row({ enrollmentDeadline: null })],
  ])("REFUSES a discounted checkout against %s", async (_label, program) => {
    getFoundingProgramMock.mockResolvedValue(program);

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(form(true)),
    );

    expect(destination).toContain("founding_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  /**
   * Six environment variables carry the discounted Stripe prices and they are
   * unset today. An open programme with no provisioned price would otherwise
   * charge the full rate on a page that quoted the discounted one.
   */
  it("REFUSES a discounted checkout when the discounted prices are unprovisioned", async () => {
    hasFoundingConfigMock.mockReturnValue(false);

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(form(true)),
    );

    expect(destination).toContain("founding_unavailable");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  /** An unprovisioned discount must never block an ordinary purchase. */
  it("still opens an ordinary checkout when the discounted prices are unprovisioned", async () => {
    hasFoundingConfigMock.mockReturnValue(false);
    getFoundingProgramMock.mockResolvedValue(null);

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(form(false)),
    );

    expect(destination).toBe("https://checkout.test/s");
  });

  /** Every refusal this action can raise must be a sentence on the plans page. */
  it("routes the refusal somewhere it can be read", async () => {
    getFoundingProgramMock.mockResolvedValue(null);

    const destination = await redirectedTo(() =>
      startHostCheckoutAction(form(true)),
    );

    expect(destination.startsWith("/host/plans?")).toBe(true);
  });
});
