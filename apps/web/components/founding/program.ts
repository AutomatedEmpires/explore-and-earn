import { FOUNDING_LOCKED_PRICING } from "@explore-and-earn/contracts";

/**
 * THE CONFIG SEAM FOR THE FOUNDING HOST PROGRAM.
 *
 * Guardrail G53 (tools/scripts/check-founding-host-claims.mjs) allows the
 * program's language in an allow-listed handful of files and FAILS any of them
 * that renders a count, a remainder or a deadline without going through this
 * module. That rule exists because of what the program was: a term sheet with
 * numbers in the marketing copy and no code that counted anything. The numbers
 * are now facts about a database row, and this is the only place a surface may
 * turn that row into something renderable.
 *
 * THE PRODUCT LAW, in one sentence: nothing quantitative is rendered until the
 * founder configures the program. Not a count, not a remainder, not a countdown,
 * not "limited places". An unconfigured program gets at most one qualitative
 * sentence, and a countdown may only ever tick DOWN toward a deadline the SERVER
 * supplied — never a client-side timer seeded from the visitor's clock, which is
 * the pattern that resets on reload and is a lie the second time you see it.
 *
 * The four view states below are exhaustive and each one is a different honest
 * thing to say:
 *
 *   unconfigured — no row, or the founder has it in draft. Say a program is
 *                  coming, or say nothing. Never a number.
 *   open         — real capacity, real claimed, real deadline in the future.
 *                  This is the only state in which a figure may appear.
 *   full         — every seat is taken. Say so; do not keep offering it.
 *   ended        — enrolment is closed, by date or by decision. Say so.
 *
 * `open` is COMPUTED rather than trusted: a row that says 'open' but has no
 * deadline, a deadline in the past, or no seats left is NOT open, because
 * claim_founding_host_seat (migration 087) would refuse it. The page and the
 * database must agree about whether a seat exists, or the page is advertising
 * something the server will decline.
 *
 * This module is deliberately free of server-only imports so the countdown, a
 * client component, can share the same view type without pulling the database
 * layer into the browser bundle.
 */

/**
 * The four columns anon may read from public.founding_host_program. Declared
 * structurally rather than imported from the database package: the shape is the
 * contract between them, and a structural declaration keeps this module usable
 * from a client component.
 */
export interface FoundingProgramRow {
  readonly capacity: number;
  readonly claimed: number;
  readonly enrollmentDeadline: string | null;
  readonly status: "draft" | "open" | "full" | "ended";
}

/**
 * The ONLY input a countdown may take: an absolute instant chosen by the founder
 * and stored in the database.
 *
 * Declared here rather than on the component so the shape cannot quietly grow a
 * duration, an offset or a "starts now" seed — the pattern that produces a timer
 * which resets on reload and is a lie the second time a visitor sees it. A
 * countdown subtracts from an instant somebody chose, or it does not exist.
 */
export interface FoundingDeadline {
  readonly deadlineIso: string;
}

export type FoundingViewState = "unconfigured" | "open" | "full" | "ended";

export interface FoundingProgramView {
  readonly state: FoundingViewState;
  /**
   * Present ONLY when the state is 'open' or 'full'. Every other state renders
   * no number at all, so there is nothing here to render by accident.
   */
  readonly counts: {
    readonly capacity: number;
    readonly claimed: number;
    readonly remaining: number;
  } | null;
  /** ISO timestamp, present only when the state is 'open'. */
  readonly deadlineIso: string | null;
  /** True when a seat can actually be claimed right now. */
  readonly claimable: boolean;
}

const DARK: FoundingProgramView = {
  state: "unconfigured",
  counts: null,
  deadlineIso: null,
  claimable: false,
};

/**
 * Turn the stored row into the only thing a surface is allowed to render.
 *
 * `now` is injectable so the boundary case — a deadline that passes between one
 * request and the next — is testable rather than argued about.
 */
export function resolveFoundingProgramView(
  program: FoundingProgramRow | null,
  now: Date = new Date(),
): FoundingProgramView {
  if (!program) return DARK;

  // Draft is the founder's staging state. It exists so a capacity and a date can
  // be typed in and reviewed before anything is published, which only works if
  // draft renders exactly what no-row renders.
  if (program.status === "draft") return DARK;

  const capacity = Math.max(0, program.capacity);
  const claimed = Math.min(Math.max(0, program.claimed), capacity);
  const counts = { capacity, claimed, remaining: capacity - claimed };

  if (program.status === "ended") {
    return { state: "ended", counts: null, deadlineIso: null, claimable: false };
  }

  if (program.status === "full" || counts.remaining <= 0) {
    return { state: "full", counts, deadlineIso: null, claimable: false };
  }

  // A configured capacity of zero is not an offer, whatever the status column
  // says. Nor is a program with no deadline, or one whose deadline has passed —
  // in all three cases the claim function would refuse, and a page that offers a
  // seat the server declines is worse than a page that offers nothing.
  const deadline = program.enrollmentDeadline
    ? new Date(program.enrollmentDeadline)
    : null;
  const deadlineValid =
    deadline !== null &&
    Number.isFinite(deadline.getTime()) &&
    deadline.getTime() > now.getTime();

  if (capacity === 0 || !deadlineValid) {
    return { state: "ended", counts: null, deadlineIso: null, claimable: false };
  }

  return {
    state: "open",
    counts,
    deadlineIso: deadline.toISOString(),
    claimable: true,
  };
}

/**
 * The founding rate for a tier and interval, in integer cents.
 *
 * Reads FOUNDING_LOCKED_PRICING and nothing else. The numbers are founder-locked
 * in packages/contracts and the pricing guardrail keeps them there; this
 * function exists so a surface asks for "the founding rate for this tier and
 * interval" instead of reaching into the contract and formatting a figure of its
 * own.
 */
export function foundingRateCents(
  tier: keyof typeof FOUNDING_LOCKED_PRICING,
  interval: "monthly" | "yearly",
): number {
  return FOUNDING_LOCKED_PRICING[tier][interval];
}

/**
 * The terms, QUOTED FROM THE CONTRACT with nothing added.
 *
 * packages/contracts/src/pricing.ts states the program as: a lifetime-locked
 * discount, host and seat scoped so it survives a tier change, forfeited
 * permanently on cancellation. Those facts are the whole offer. A benefit that
 * is not in that sentence is not part of the program, and adding one here is how
 * a term sheet grows features nobody agreed to — which is precisely what this
 * program was the estate's example of.
 *
 * The contract's seat CAP is deliberately absent: the real capacity is whatever
 * the founder configured, read from the database, and quoting a default beside a
 * different live figure would state two numbers for one fact.
 */
export const FOUNDING_TERMS: readonly string[] = [
  "The discount is locked for the lifetime of the subscription.",
  "It belongs to the seat rather than the plan, so it survives a tier change.",
  "It is forfeited permanently if the subscription is cancelled.",
];
