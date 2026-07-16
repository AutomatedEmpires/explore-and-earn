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
 * Everything defaults to en-US / USD so today's rendered strings are byte-for-
 * byte identical, but every function accepts an optional `locale` (and money an
 * optional `currency`) so a later i18n wave threads real locales through a
 * single seam. Raw `Intl.*` / literal `"en-US"` / `"USD"` must NOT appear
 * anywhere else — the tools/scripts/check-locale-literals.mjs ratchet enforces
 * this (this file + apps/web/lib/format are the only allowlisted homes).
 */

/** Default display locale until the i18n wave threads a real one through. */
export const DEFAULT_LOCALE = "en-US";
/** Default currency for money whose row carries no explicit currency code. */
export const DEFAULT_CURRENCY = "USD";

/** En-dash used to join ranges ("$1,000–$1,500", "Aug–Oct 2026"). */
const EN_DASH = "–";

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
  /** Returned when there is no summary and no min amount. Default "Negotiable". */
  readonly fallback?: string;
  /** Prefix applied to a lone amount only (no max), e.g. "From ". Default "". */
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
 * Reproduce the compensation-summary strings the DB row mappers used to build
 * inline. Prefers host-authored `summary`; otherwise derives from cents. See the
 * per-call options for the small variations across surfaces (discovery cards vs
 * the admin console) — all reproduced exactly for the default en-US / USD.
 */
export function formatCompensation(
  input: CompensationInput,
  opts: CompensationFormatOptions = {},
): string {
  const {
    locale = DEFAULT_LOCALE,
    fallback = "Negotiable",
    singleValuePrefix = "",
    suffixMode = "exchangeAware",
    collapseEqualRange = true,
  } = opts;

  if (typeof input.summary === "string" && input.summary.length > 0) {
    return input.summary;
  }

  const minCents = typeof input.minCents === "number" ? input.minCents : null;
  if (minCents == null) return fallback;

  const currency = input.currency ?? undefined; // null/undefined → default USD
  const money = (cents: number) => formatMoney(cents, { currency, locale });

  const min = money(minCents);
  const maxCents = typeof input.maxCents === "number" ? input.maxCents : null;
  const max = maxCents != null ? money(maxCents) : null;

  const showRange =
    max != null && (collapseEqualRange ? max !== min : true);
  const range = showRange ? `${min}${EN_DASH}${max}` : `${singleValuePrefix}${min}`;

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
