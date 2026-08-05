/**
 * Locale-aware display formatters — the single, dependency-free formatting
 * chokepoint for the whole monorepo.
 *
 * WHY THIS LIVES IN @explore-and-earn/contracts (not apps/web): the DB row
 * mappers (@explore-and-earn/db) must ALSO stop hardcoding `en-US`/`USD`/inline
 * `Intl.*`, and `packages/db` cannot import from `apps/web` (wrong dependency
 * direction). `contracts` is the one package every layer already depends on, so
 * putting the pure implementations here lets the DB edge and the web edge share
 * ONE locale-ready implementation. `apps/web/lib/format` re-exports these as the
 * app-facing chokepoint the i18n wave builds on.
 *
 * Everything defaults to en-US / USD — the extraction into this file changed no
 * rendered string — but every function accepts an optional `locale` (and money
 * an optional `currency`) so a later i18n wave threads real locales through a
 * single seam. (formatCompensation's SHAPE has since changed by founder
 * decision; see its own doc comment.)
 *
 * New raw `Intl.*` / literal `"en-US"` / `"USD"` must not appear outside this
 * file and apps/web/lib/format, which are the only allowlisted homes. That is a
 * RATCHET, not a state the codebase is already in:
 * tools/scripts/check-locale-literals.mjs baselines each file's current count
 * and fails only when a file exceeds it, so historic call sites still exist and
 * are listed in tools/scripts/locale-literal-baseline.json. Migrating one to
 * these formatters and re-running the script with `--update` is how the number
 * comes down.
 */

import { NOT_STATED_LABEL } from "./provenance"

/** Default display locale until the i18n wave threads a real one through. */
export const DEFAULT_LOCALE = "en-US";
/** Default currency for money whose row carries no explicit currency code. */
export const DEFAULT_CURRENCY = "USD";

/** En-dash used to join ranges ("$1,000–$1,500", "Aug–Oct 2026"). */
const EN_DASH = "–";

/**
 * Prefix for a stated ceiling with no stated floor. The mirror of
 * {@link CompensationFormatOptions.singleValuePrefix}: 070's publication CHECK
 * accepts a listing that states only `compensation_max_cents`, so this case is
 * reachable and must read as the bound it is rather than fall through to
 * "nothing stated".
 */
const MAX_ONLY_PREFIX = "Up to ";

export interface MoneyFormatOptions {
  /** ISO 4217 currency code. Omit/undefined → {@link DEFAULT_CURRENCY}. */
  readonly currency?: string;
  /** BCP-47 locale. Omit/undefined → {@link DEFAULT_LOCALE}. */
  readonly locale?: string;
  /** Defaults to 0 (whole-dollar display, matching the legacy formatters). */
  readonly maximumFractionDigits?: number;
  readonly minimumFractionDigits?: number;
}

/**
 * Format an integer **cent** amount as currency. `formatMoney(150000)` →
 * "$1,500". The single place `Intl.NumberFormat` is constructed for money.
 */
export function formatMoney(cents: number, opts: MoneyFormatOptions = {}): string {
  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    maximumFractionDigits = 0,
    minimumFractionDigits,
  } = opts;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits,
    ...(minimumFractionDigits != null ? { minimumFractionDigits } : {}),
  }).format(cents / 100);
}

export interface CompensationInput {
  /** Host-authored free text; when present it wins over any derived range. */
  readonly summary?: string | null;
  readonly minCents?: number | null;
  readonly maxCents?: number | null;
  /** Compensation period ("hour" | "day" | "week" | "month" | "stipend" | …). */
  readonly unit?: string | null;
  /** ISO 4217 code; null/undefined → {@link DEFAULT_CURRENCY}. */
  readonly currency?: string | null;
}

export interface CompensationFormatOptions {
  readonly locale?: string;
  /**
   * Returned when there is no summary and NO figure at all. Defaults to
   * {@link NOT_STATED_LABEL} — see the note on {@link formatCompensation} for
   * why this is deliberately not a friendlier word.
   */
  readonly fallback?: string;
  /**
   * Prefix applied to a lone MINIMUM (a floor with no stated ceiling), e.g.
   * "From ". Default "From " (founder, 2026-07-26: "pay should be defined per
   * listing. can be from/ or starting at x"). An exact figure — min and max
   * both stated and equal — is NOT prefixed: it is a number, not a floor.
   */
  readonly singleValuePrefix?: string;
  /**
   * `exchangeAware` (default): drop the `/unit` suffix for non-cash units
   * (other/exchange/stipend), matching the discovery-card summary. `always`:
   * append `/unit` whenever a unit exists (matching the admin summary).
   */
  readonly suffixMode?: "exchangeAware" | "always";
  /**
   * When true (default) a range whose max equals min collapses to a single
   * value. `false` keeps `min–max` whenever a max exists (admin behaviour).
   */
  readonly collapseEqualRange?: boolean;
}

/**
 * Turn a listing's compensation columns into a pay string. Prefers host-authored
 * `summary`; otherwise derives from cents.
 *
 * This is the SHARED implementation, not a universal one: it is the only place
 * the rule below is written down, and every surface that renders pay should call
 * it rather than derive its own. Saying "the one string every surface shows"
 * would be a claim about call sites that this module cannot enforce — and it was
 * false when it was written, because the public host-profile card derived pay
 * inline and printed "See listing" for silence. A surface that skips this
 * function is a defect to fix, not an exception this comment describes.
 *
 * PAY IS PER LISTING AND IT IS EITHER STATED OR IT IS NOT (founder,
 * 2026-07-26). Four outcomes, and nothing else:
 *
 *   floor only        "From $1,500"      min stated, no ceiling
 *   ceiling only      "Up to $1,500"     max stated, no floor
 *   range             "$1,200–$1,500"    both stated (equal collapses to one
 *                                        exact figure, unprefixed)
 *   nothing stated    {@link NOT_STATED_LABEL}
 *
 * The last case used to read "Negotiable". Nobody had negotiated anything —
 * that word turned an empty column into a claim about what the host would do,
 * which is the same defect the benefit triad's "absence is never a no" rule
 * exists to stop. It is deliberately NOT replaced with a friendlier stand-in
 * like "See listing" or "Ask the host": those are also inventions.
 *
 * On a PUBLISHED listing the last case is close to unreachable, and by
 * construction rather than by hope: 070's listings_publication_triad_chk
 * refuses `under_review` and `live` unless pay_evidence is 'confirmed' AND at
 * least one of the two compensation columns is greater than zero. It stays
 * reachable for a draft (which only its own host sees) and for a sourced
 * listing whose origin never stated pay — exactly the row that must say so.
 *
 * See the per-call options for the variations between surfaces (discovery cards
 * vs the admin console).
 */
export function formatCompensation(
  input: CompensationInput,
  opts: CompensationFormatOptions = {},
): string {
  const {
    locale = DEFAULT_LOCALE,
    fallback = NOT_STATED_LABEL,
    singleValuePrefix = "From ",
    suffixMode = "exchangeAware",
    collapseEqualRange = true,
  } = opts;

  if (typeof input.summary === "string" && input.summary.length > 0) {
    return input.summary;
  }

  const minCents = typeof input.minCents === "number" ? input.minCents : null;
  const maxCents = typeof input.maxCents === "number" ? input.maxCents : null;
  if (minCents == null && maxCents == null) return fallback;

  const currency = input.currency ?? undefined; // null/undefined → default USD
  const money = (cents: number) => formatMoney(cents, { currency, locale });

  const min = minCents != null ? money(minCents) : null;
  const max = maxCents != null ? money(maxCents) : null;

  let range: string;
  if (min != null && max != null) {
    // An equal min and max is an EXACT figure. Prefixing it with "From " would
    // read as a floor the host never described, so the prefix belongs only to
    // the branch that genuinely has no ceiling.
    range = collapseEqualRange && min === max ? min : `${min}${EN_DASH}${max}`;
  } else if (min != null) {
    range = `${singleValuePrefix}${min}`;
  } else {
    range = `${MAX_ONLY_PREFIX}${max}`;
  }

  if (suffixMode === "always") {
    return input.unit ? `${range}/${input.unit}` : range;
  }
  const unit = input.unit ?? "other";
  return unit === "other" || unit === "exchange" || unit === "stipend"
    ? range
    : `${range}/${unit}`;
}

/**
 * Format an ISO date as a short month + year, e.g. "Aug 2026". The single home
 * for the `toLocaleDateString(month:"short", year:"numeric")` pattern.
 */
export function formatMonthYear(iso: string, locale: string = DEFAULT_LOCALE): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
  });
}

/**
 * General ISO-date formatter — thin, locale-ready wrapper over
 * `toLocaleDateString`. Callers pass their own `Intl.DateTimeFormatOptions`.
 */
export function formatDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {},
  locale: string = DEFAULT_LOCALE,
): string {
  return new Date(iso).toLocaleDateString(locale, opts);
}

export interface DateTimeZoneFormatOptions {
  /** IANA zone. Invalid zones return the ISO string rather than throwing. */
  readonly timeZone: string;
  readonly locale?: string;
}

/**
 * Interview/lifecycle timestamp with an explicit IANA zone and short zone
 * label. This is the one home for component-facing `Intl.DateTimeFormat`.
 */
export function formatDateTimeInZone(
  iso: string,
  opts: DateTimeZoneFormatOptions,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  try {
    return new Intl.DateTimeFormat(opts.locale ?? DEFAULT_LOCALE, {
      timeZone: opts.timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Browser/server runtime's current IANA zone, with a deterministic fallback. */
export function resolvedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Validate a bounded IANA zone without leaking raw Intl construction to callers. */
export function isValidTimeZone(value: string): boolean {
  if (value.length < 1 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** IANA name plus current UTC offset, e.g. America/Los_Angeles (GMT-07:00). */
export function formatTimeZoneLabel(
  timeZone: string,
  at: Date = new Date(),
  locale: string = DEFAULT_LOCALE,
): string {
  try {
    const offset = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value;
    return `${timeZone}${offset ? ` (${offset})` : ""}`;
  } catch {
    return timeZone;
  }
}

/**
 * Season length, derived from the two stored dates and NOTHING else.
 *
 * This is arithmetic on `begins_at`/`ends_at`, not an invented field: a card
 * that shows "Jun 2 – Sep 14" is asking the reader to do the subtraction, and
 * the subtraction is the fact they actually care about ("how long am I gone
 * for"). Returns null when either date is missing or unparseable — a missing
 * season length must read as missing, never as zero.
 *
 * Weeks below one month, months above; both rounded, both hedged with "about",
 * because a listing's real end date moves and a precise-looking number would
 * over-claim.
 */
export function formatSeasonLength(
  begins?: string | null,
  ends?: string | null,
): string | null {
  if (!begins || !ends) return null;
  const from = Date.parse(begins);
  const to = Date.parse(ends);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  const days = Math.round((to - from) / 86_400_000);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"}`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `about ${weeks} weeks`;
  const months = Math.round(days / 30.44);
  return `about ${months} months`;
}

export interface OpportunityWindowInput {
  /** Host-authored timeline text; wins over the begins/ends range. */
  readonly timelineSummary?: string | null;
  readonly begins?: string | null;
  readonly ends?: string | null;
}

/**
 * Reproduce the "opportunity window" string: host timeline text if present,
 * else a "Aug–Oct 2026" month-year range when BOTH begins & ends exist, else
 * "Open". Callers that never derived a range (they only ever showed the summary
 * or "Open") simply omit begins/ends.
 */
export function formatOpportunityWindow(
  input: OpportunityWindowInput,
  opts: { readonly locale?: string } = {},
): string {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  if (
    typeof input.timelineSummary === "string" &&
    input.timelineSummary.length > 0
  ) {
    return input.timelineSummary;
  }
  if (input.begins && input.ends) {
    return `${formatMonthYear(input.begins, locale)}${EN_DASH}${formatMonthYear(input.ends, locale)}`;
  }
  return "Open";
}
