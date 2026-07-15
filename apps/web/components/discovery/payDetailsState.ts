import type { BenefitProvision } from "@explore-and-earn/contracts";

export interface PayBenchmarkState {
  readonly hasBenchmark: boolean;
  readonly headline: string;
  readonly emptyKicker: string;
  readonly emptyMessage: string;
}

export function canOpenPayDetails(provision: BenefitProvision): boolean {
  return provision !== "not_provided";
}

export function getPayDetailsHeadline(summary: string | undefined): string {
  return summary?.trim() || "Not provided";
}

export function getPayBenchmarkState(
  provision: BenefitProvision,
  meterValue: number | undefined,
): PayBenchmarkState {
  const hasBenchmark =
    canOpenPayDetails(provision) &&
    typeof meterValue === "number" &&
    Number.isFinite(meterValue) &&
    meterValue >= 0 &&
    meterValue <= 100;

  if (hasBenchmark) {
    return {
      hasBenchmark: true,
      headline: "Pay benchmark available",
      emptyKicker: "",
      emptyMessage: "",
    };
  }

  if (!canOpenPayDetails(provision)) {
    return {
      hasBenchmark: false,
      headline: "Pay unavailable",
      emptyKicker: "Pay not provided",
      emptyMessage: "This host has not provided pay details for this listing.",
    };
  }

  return {
    hasBenchmark: false,
    headline: "Comparison unavailable",
    emptyKicker: "Host-provided pay",
    emptyMessage:
      "The host provided pay details, but this listing has no verified market comparison.",
  };
}
