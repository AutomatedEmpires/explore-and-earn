// State minimum wages, the default of the `listings.min_wage_cents_by_state` setting, which an
// operator updates each January 1 (SP2 spec section 13). The "pay below minimum wage" listing
// check is a warning only.
//
// Source: the US Department of Labor state minimum wage table, rates in effect on 2026-01-01.
// States with regional rates use the statewide headline rate (New York outside New York City,
// Long Island and Westchester; Oregon's standard rate). States with no minimum wage law, or a
// rate below the federal one, use the federal $7.25.
import type { USStateCode } from './us-states';

export const FEDERAL_MIN_WAGE_CENTS = 725;

const F = FEDERAL_MIN_WAGE_CENTS;

export const MIN_WAGE_CENTS_2026: Record<USStateCode, number> = {
  AL: F,
  AK: 1300,
  AZ: 1515,
  AR: 1100,
  CA: 1690,
  CO: 1516,
  CT: 1694,
  DE: 1500,
  DC: 1795,
  FL: 1400,
  GA: F,
  HI: 1600,
  ID: F,
  IL: 1500,
  IN: F,
  IA: F,
  KS: F,
  KY: F,
  LA: F,
  ME: 1510,
  MD: 1500,
  MA: 1500,
  MI: 1373,
  MN: 1141,
  MS: F,
  MO: 1500,
  MT: 1085,
  NE: 1500,
  NV: 1200,
  NH: F,
  NJ: 1592,
  NM: 1200,
  NY: 1600,
  NC: F,
  ND: F,
  OH: 1100,
  OK: F,
  OR: 1505,
  PA: F,
  RI: 1600,
  SC: F,
  SD: 1185,
  TN: F,
  TX: F,
  UT: F,
  VT: 1442,
  VA: 1277,
  WA: 1713,
  WV: 875,
  WI: F,
  WY: F,
  PR: 1050,
  VI: 1050,
  GU: 925,
  AS: F,
  MP: F,
};
