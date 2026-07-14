/**
 * apps/web display-formatting chokepoint.
 *
 * The single place the web edge imports locale-aware formatters from. The pure
 * implementations live in `@explore-and-earn/contracts` (so the DB row mappers
 * can share the exact same logic — see packages/contracts/src/format.ts), and
 * this module re-exports them under the app-facing barrel the i18n wave builds
 * on. Import `formatMoney` / `formatDate` / `formatCompensation` / … from
 * `@/lib/format`, never construct `Intl.*` or hardcode `"en-US"` / `"USD"` in a
 * component (the tools/scripts/check-locale-literals.mjs ratchet enforces this).
 */

export {
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
  formatMoney,
  formatCompensation,
  formatMonthYear,
  formatDate,
  formatOpportunityWindow,
  type MoneyFormatOptions,
  type CompensationInput,
  type CompensationFormatOptions,
  type OpportunityWindowInput,
} from "@explore-and-earn/contracts";
