import type { BenefitProvision } from "./benefits";
import { COMPENSATION_UNIT, type CompensationUnit } from "./enums";

const UNIT_SUFFIX: Record<CompensationUnit, string> = {
  hour: "/hr",
  day: "/day",
  week: "/wk",
  month: "/mo",
  year: "/yr",
  stipend: " stipend",
  exchange: "",
  other: "",
};

export interface ListingPayProjectionInput {
  readonly minCents?: number | null;
  readonly maxCents?: number | null;
  readonly unit?: string | null;
  readonly currency?: string | null;
  readonly summary?: string | null;
}

export interface ListingPayProjection {
  readonly minCents: number | null;
  readonly maxCents: number | null;
  readonly unit: CompensationUnit | null;
  readonly currency: string;
  readonly summary: string;
  readonly provision: Extract<BenefitProvision, "provided" | "not_provided">;
  readonly hasNumericPay: boolean;
}

export interface ListingPayDraftInput {
  readonly minInput: string;
  readonly maxInput: string;
  readonly unit: string;
  readonly currency?: string | null;
}

export interface ResolvedListingPayDraft {
  readonly minAmount: number | null;
  readonly maxAmount: number | null;
  readonly minCents: number | null;
  readonly maxCents: number | null;
  readonly unit: CompensationUnit;
  readonly currency: string;
}

export type ListingPayDraftResolution =
  | {
      readonly ok: true;
      readonly value: ResolvedListingPayDraft;
      readonly projection: ListingPayProjection;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly projection: ListingPayProjection;
    };

function isCompensationUnit(value: string | null | undefined): value is CompensationUnit {
  return (COMPENSATION_UNIT as readonly string[]).includes(value ?? "");
}

function normalizeCurrency(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normalizeCents(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

function formatMoney(cents: number, currency: string): string {
  const hasFraction = cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(cents / 100);
}

/**
 * Canonical seeker-facing projection for listing pay. Every listing surface
 * uses this function so min-only, max-only, exchange, and blank values cannot
 * drift into different claims.
 */
export function projectListingPay(
  input: ListingPayProjectionInput,
): ListingPayProjection {
  const unit = isCompensationUnit(input.unit) ? input.unit : null;
  const currency = normalizeCurrency(input.currency);
  const exchange = unit === "exchange";
  const minCents = exchange ? null : normalizeCents(input.minCents);
  const maxCents = exchange ? null : normalizeCents(input.maxCents);
  const customSummary = input.summary?.trim() ?? "";
  const hasNumericPay = minCents !== null || maxCents !== null;
  const provision: ListingPayProjection["provision"] =
    customSummary || exchange || hasNumericPay ? "provided" : "not_provided";

  let summary: string;
  if (exchange) {
    summary = "Work exchange";
  } else if (customSummary) {
    summary = customSummary;
  } else {
    const suffix = unit ? UNIT_SUFFIX[unit] : "";
    if (minCents !== null && maxCents !== null) {
      const min = formatMoney(minCents, currency);
      const max = formatMoney(maxCents, currency);
      summary = `${min === max ? min : `${min}–${max}`}${suffix}`;
    } else if (minCents !== null) {
      summary = `${formatMoney(minCents, currency)}${suffix}`;
    } else if (maxCents !== null) {
      summary = `Up to ${formatMoney(maxCents, currency)}${suffix}`;
    } else {
      summary = "Not provided";
    }
  }

  return {
    minCents,
    maxCents,
    unit,
    currency,
    summary,
    provision,
    hasNumericPay,
  };
}

type ParsedAmount =
  | { readonly ok: true; readonly amount: number | null; readonly cents: number | null }
  | { readonly ok: false; readonly error: string };

function parseAmountInput(raw: string, label: "minimum" | "maximum"): ParsedAmount {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, amount: null, cents: null };

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: `Pay ${label} must be a non-negative number.` };
  }

  const unroundedCents = amount * 100;
  const cents = Math.round(unroundedCents);
  if (
    Math.abs(unroundedCents - cents) > 1e-7 ||
    !Number.isSafeInteger(cents)
  ) {
    return {
      ok: false,
      error: `Pay ${label} must use at most two decimal places.`,
    };
  }

  return { ok: true, amount: cents / 100, cents };
}

/**
 * Validates host-form inputs and resolves them to both whole-unit amounts for
 * the write API and canonical cents for previews. Blank values intentionally
 * resolve to null, which lets edit submissions clear previously stored bounds.
 */
export function resolveListingPayDraft(
  input: ListingPayDraftInput,
): ListingPayDraftResolution {
  const unit = isCompensationUnit(input.unit) ? input.unit : null;
  const currency = normalizeCurrency(input.currency);

  if (!unit) {
    return {
      ok: false,
      error: "Choose a valid pay period.",
      projection: {
        ...projectListingPay({ currency }),
        summary: "Check pay details",
      },
    };
  }

  if (unit === "exchange") {
    const projection = projectListingPay({ unit, currency });
    return {
      ok: true,
      value: {
        minAmount: null,
        maxAmount: null,
        minCents: null,
        maxCents: null,
        unit,
        currency,
      },
      projection,
    };
  }

  const min = parseAmountInput(input.minInput, "minimum");
  if (!min.ok) {
    return {
      ok: false,
      error: min.error,
      projection: {
        ...projectListingPay({ unit, currency }),
        summary: "Check pay details",
      },
    };
  }

  const max = parseAmountInput(input.maxInput, "maximum");
  if (!max.ok) {
    return {
      ok: false,
      error: max.error,
      projection: {
        ...projectListingPay({ unit, currency }),
        summary: "Check pay details",
      },
    };
  }

  if (min.cents !== null && max.cents !== null && max.cents < min.cents) {
    return {
      ok: false,
      error: "Pay maximum must be greater than or equal to pay minimum.",
      projection: {
        ...projectListingPay({ unit, currency }),
        summary: "Check pay range",
      },
    };
  }

  const projection = projectListingPay({
    minCents: min.cents,
    maxCents: max.cents,
    unit,
    currency,
  });

  return {
    ok: true,
    value: {
      minAmount: min.amount,
      maxAmount: max.amount,
      minCents: min.cents,
      maxCents: max.cents,
      unit,
      currency,
    },
    projection,
  };
}
