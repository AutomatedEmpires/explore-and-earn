// @explore-and-earn/eslint-plugin — flat-config plugin object.
//
// STATUS: only `no-direct-stripe-refund` has a real implementation. The other
// five rules are still the empty `create() { return {} }` stubs left behind
// when this package was scaffolded — registering them here does not make them
// do anything; it only makes the rule *names* resolve so `eslint.config.mjs`
// can reference them without an "unknown rule" error, and gives every rule a
// documented home instead of dead, unreachable files.
//
// Four of the five stubs are already superseded by working, CI-wired checks
// in the `guardrails` npm script and are intentionally left "off" here rather
// than re-implemented as a duplicate:
//   no-pricing-literals            -> tools/scripts/check-pricing.mjs
//   no-external-calendar-sync      -> tools/scripts/check-calendar-sync.mjs
//   no-monetization-in-match       -> tools/scripts/check-match-isolation.mjs
//   verified-host-via-component-only -> tools/scripts/check-canon-contracts.mjs (partial: checks the
//       contract constant, not component-only rendering — a real gap, but a
//       narrower one than the rule name implies)
// `no-lifecycle-string-literals` has no script equivalent, but a correct
// implementation needs product sign-off on scope (comparing a status literal
// against a typed union is normal, safe TypeScript in hundreds of existing
// call sites — a naive "ban the literal" rule would be almost entirely false
// positives). Left as a stub pending that scoping, not implemented blind.

import noDirectStripeRefund from "./rules/no-direct-stripe-refund.ts";
import noExternalCalendarSync from "./rules/no-external-calendar-sync.ts";
import noLifecycleStringLiterals from "./rules/no-lifecycle-string-literals.ts";
import noMonetizationInMatch from "./rules/no-monetization-in-match.ts";
import noPricingLiterals from "./rules/no-pricing-literals.ts";
import noUntranslatedJsxText from "./rules/no-untranslated-jsx-text.ts";
import verifiedHostViaComponentOnly from "./rules/verified-host-via-component-only.ts";

export default {
  meta: {
    name: "@explore-and-earn/eslint-plugin",
    version: "0.1.0",
  },
  rules: {
    "no-direct-stripe-refund": noDirectStripeRefund,
    "no-external-calendar-sync": noExternalCalendarSync,
    "no-lifecycle-string-literals": noLifecycleStringLiterals,
    "no-monetization-in-match": noMonetizationInMatch,
    "no-pricing-literals": noPricingLiterals,
    "no-untranslated-jsx-text": noUntranslatedJsxText,
    "verified-host-via-component-only": verifiedHostViaComponentOnly,
  },
};
