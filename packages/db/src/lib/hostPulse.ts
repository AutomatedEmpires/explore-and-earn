/**
 * The hiring pulse: a host's recruiting activity over a window, against the
 * window before it.
 *
 * WHY THIS MODULE EXISTS. `getHostAnalytics` answers "how many, ever" — every
 * figure in it is all-time and takes no time argument. That is a fine answer to
 * a different question, and it is the only answer the workspace had, which is
 * why the KPI strip on the old dashboard carried literal strings like "All-time"
 * and "Review" in the slot where a trend belongs. A number with a fake trend
 * beside it is worse than a number alone: it invites a decision the data cannot
 * support.
 *
 * So the comparison is computed from timestamps that already exist on rows the
 * host already owns — `applications.submitted_at`, `invites.created_at`,
 * `invites.responded_at`, `listings.published_at`. Nothing new is stored and
 * nothing is inferred.
 *
 * PURE ON PURPOSE. `queries/*` and `hostAnalytics.ts` import "server-only",
 * which vitest cannot load — and the window arithmetic and the delta rules are
 * exactly the parts that need tests. The IO lives in ../hostWorkspace.ts and
 * does nothing but fetch timestamps and hand them here.
 */

/** How far back a pulse looks. The previous window is the same length again. */
export const PULSE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The two comparable windows, as ISO bounds. */
export interface PulseWindows {
  /** Start of the CURRENT window (inclusive). */
  readonly currentFrom: string;
  /** Start of the PREVIOUS window (inclusive); also the current window's floor. */
  readonly previousFrom: string;
  /** `now`, the current window's exclusive ceiling. */
  readonly now: string;
  readonly days: number;
}

/**
 * Two back-to-back windows of equal length ending at `nowMs`.
 *
 * Equal length is the whole point: comparing 30 days against a calendar month
 * would make February look like a collapse every year.
 */
export function pulseWindows(
  nowMs: number,
  days: number = PULSE_WINDOW_DAYS,
): PulseWindows {
  const span = Math.max(1, Math.trunc(days)) * DAY_MS;
  return {
    now: new Date(nowMs).toISOString(),
    currentFrom: new Date(nowMs - span).toISOString(),
    previousFrom: new Date(nowMs - span * 2).toISOString(),
    days: Math.max(1, Math.trunc(days)),
  };
}

/**
 * How a metric moved. `changePercent` is null when the previous window was
 * empty — "up 100%" from zero is a sentence about nothing, and rendering it
 * beside a real percentage would let a host read the two as comparable.
 */
export interface PulseDelta {
  readonly current: number;
  readonly previous: number;
  readonly change: number;
  readonly changePercent: number | null;
  readonly direction: "up" | "down" | "flat";
}

export function pulseDelta(current: number, previous: number): PulseDelta {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    changePercent:
      previous > 0 ? Math.round((change / previous) * 100) : null,
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}

/** One timestamped record, reduced to the only field the pulse needs. */
export interface PulseStamp {
  readonly at: string | null;
}

/**
 * Count stamps falling in [from, to). Half-open so a row on the boundary is
 * counted exactly once across the two windows rather than in both.
 */
export function countInWindow(
  stamps: readonly PulseStamp[],
  from: string,
  to: string,
): number {
  let total = 0;
  for (const stamp of stamps) {
    const at = stamp.at;
    if (!at) continue;
    if (at >= from && at < to) total += 1;
  }
  return total;
}

/** Current-vs-previous for one series of timestamps. */
export function deltaForStamps(
  stamps: readonly PulseStamp[],
  windows: PulseWindows,
): PulseDelta {
  return pulseDelta(
    countInWindow(stamps, windows.currentFrom, windows.now),
    countInWindow(stamps, windows.previousFrom, windows.currentFrom),
  );
}

/**
 * The whole pulse. Every member is a real count of real rows in a real window.
 *
 * `measurable` is the honesty flag the UI keys its empty state off: a host with
 * no listings has no recruiting activity to compare, and a strip of "0, no
 * change" tiles reads as failure rather than as "you have not started".
 */
export interface HostHiringPulse {
  readonly windowDays: number;
  /** ISO start of the current window — rendered so the host knows the span. */
  readonly since: string;
  readonly applicationsReceived: PulseDelta;
  readonly invitesSent: PulseDelta;
  readonly invitesAccepted: PulseDelta;
  readonly listingsPublished: PulseDelta;
  /** False when the host has no listings at all: nothing could have happened. */
  readonly measurable: boolean;
}

export function emptyHostHiringPulse(
  days: number = PULSE_WINDOW_DAYS,
  nowMs: number = Date.now(),
): HostHiringPulse {
  const windows = pulseWindows(nowMs, days);
  const zero = pulseDelta(0, 0);
  return {
    windowDays: windows.days,
    since: windows.currentFrom,
    applicationsReceived: zero,
    invitesSent: zero,
    invitesAccepted: zero,
    listingsPublished: zero,
    measurable: false,
  };
}

export interface PulseInputs {
  readonly applications: readonly PulseStamp[];
  readonly invitesCreated: readonly PulseStamp[];
  readonly invitesResponded: readonly PulseStamp[];
  readonly listingsPublished: readonly PulseStamp[];
  readonly hasListings: boolean;
}

/** Fold raw timestamps into the pulse. Pure; the reason this module is testable. */
export function derivePulse(
  inputs: PulseInputs,
  windows: PulseWindows,
): HostHiringPulse {
  return {
    windowDays: windows.days,
    since: windows.currentFrom,
    applicationsReceived: deltaForStamps(inputs.applications, windows),
    invitesSent: deltaForStamps(inputs.invitesCreated, windows),
    invitesAccepted: deltaForStamps(inputs.invitesResponded, windows),
    listingsPublished: deltaForStamps(inputs.listingsPublished, windows),
    measurable: inputs.hasListings,
  };
}
