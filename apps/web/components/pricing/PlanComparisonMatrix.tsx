import {
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

import { formatMoney } from "../../lib/format";
import { FunnelLink } from "../analytics/FunnelEvents";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics/events";
import styles from "./planMatrix.module.css";

/**
 * The plans, side by side, in one table.
 *
 * WHY A MATRIX AND NOT THREE CARDS. Three price cards ask a host to hold three
 * lists in their head and diff them. The question they actually have is "what
 * changes if I go up a tier", and a column-per-plan table answers it by putting
 * the changing number in the same row. The V1 presentation was three cards, and
 * the founder rejected it for exactly this: it presented prices without
 * presenting a decision.
 *
 * EVERY CELL IS DERIVED FROM PLAN_ENTITLEMENTS — the same contract
 * private.enforce_listing_allowance and the invite quota read at the database.
 * Nothing here is typed, which is the point: a marketing table that states its
 * own allowance is a table that will eventually sell one the server refuses.
 * The prices come from FOUNDER_LOCKED_PRICING for the same reason, and the
 * pricing guardrail (G013) fails the build on a literal.
 *
 * NO SEAT ROW (D13). PLAN_ENTITLEMENTS.teamSeats is zero on all three tiers
 * because accepting a team invitation grants access to nothing — no policy
 * admits a team member to a listing, an applicant, a conversation or an
 * analytic. A row reading "0 / 0 / 0" would present an absent capability as a
 * limit, so the row does not exist. Raising those numbers is the last step of
 * building team access, and this table gains a row on the same day.
 *
 * ANNUAL IS DESCRIBED, NEVER DISCOUNTED IN PERCENTAGES. Annual is exactly
 * ANNUAL_MONTHS_BILLED monthly payments taken once — "two months free" — and
 * that is a fact about the invoice rather than a marketing figure.
 */

const TIERS = ["starter", "professional", "enterprise"] as const;
type Tier = (typeof TIERS)[number];

function tierName(tier: Tier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

interface MatrixRow {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly cell: (tier: Tier) => string;
}

const ROWS: readonly MatrixRow[] = [
  {
    id: "listings",
    label: "Active listings",
    note: "Published, discoverable in Seek, Swipe and Map, and able to take applications. Drafts are unlimited and cost nothing on every plan.",
    cell: (tier) => {
      const count = PLAN_ENTITLEMENTS[tier].listings;
      return count === 1 ? "1 listing" : `${count} listings`;
    },
  },
  {
    id: "invites",
    label: "Invite credits a month",
    note: "For sourcing candidates directly rather than waiting for applications. Unused credits do not roll over; purchased packs do.",
    cell: (tier) => `${PLAN_ENTITLEMENTS[tier].includedInviteCredits} a month`,
  },
  {
    id: "announcements",
    label: "Community announcements",
    note: "Reaches seekers who have not found your roles yet. Extra runs are an add-on below.",
    cell: (tier) => {
      const count = PLAN_ENTITLEMENTS[tier].monthlyAnnouncements;
      if (count === 0) return "Not included";
      return count === 1 ? "1 a month" : `${count} a month`;
    },
  },
  {
    id: "analytics",
    label: "Analytics",
    note: "Basic is account-wide: applications by stage, listing counts, invite acceptance. Full adds the per-listing breakdown.",
    cell: (tier) =>
      PLAN_ENTITLEMENTS[tier].analytics === "full"
        ? "Full, including per listing"
        : "Account-wide",
  },
];

/** True on every plan, so it is stated once rather than ticked three times. */
const ON_EVERY_PLAN: readonly string[] = [
  "Your employer profile, your role drafts, and every preview — all free, before and after you activate",
  "Applications arriving with a match score, in a pipeline with stages",
  "Messaging on each application, attached to the applicant it belongs to",
  "Eligibility for every add-on below",
];

export interface PlanComparisonMatrixProps {
  readonly checkoutConfigured: boolean;
}

export function PlanComparisonMatrix({
  checkoutConfigured,
}: PlanComparisonMatrixProps) {
  return (
    <section
      id="plans"
      className={styles.section}
      aria-labelledby="plan-matrix-title"
    >
      <div className={styles.head}>
        <h2 id="plan-matrix-title" className={styles.title}>
          What each plan changes
        </h2>
        <p className={styles.lead}>
          Every figure below is the one the server enforces. Annual billing is{" "}
          {ANNUAL_MONTHS_BILLED} monthly payments taken once a year — two months
          free — with no minimum term.
        </p>
      </div>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            Host plans compared: price, then what each plan allows.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.rowHead}>
                Plan
              </th>
              {TIERS.map((tier) => (
                <th key={tier} scope="col" className={styles.tierHead}>
                  <span className={styles.tierName}>{tierName(tier)}</span>
                  <span className={styles.tierPrice}>
                    {formatMoney(FOUNDER_LOCKED_PRICING[tier].monthly)}
                    <span className={styles.tierUnit}>/mo</span>
                  </span>
                  <span className={styles.tierAnnual}>
                    or {formatMoney(FOUNDER_LOCKED_PRICING[tier].yearly)} a year
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={styles.rowHead}>
                  <span className={styles.rowLabel}>{row.label}</span>
                  <span className={styles.rowNote}>{row.note}</span>
                </th>
                {TIERS.map((tier) => (
                  <td key={tier} className={styles.cell}>
                    {row.cell(tier)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={styles.rowHead}>
                <span className={styles.rowLabel}>Activate</span>
                <span className={styles.rowNote}>
                  The next screen states the exact amount due today, what renews
                  and when, and how to cancel — before anything is charged.
                </span>
              </th>
              {TIERS.map((tier) => (
                <td key={tier} className={styles.cell}>
                  {checkoutConfigured ? (
                    <span className={styles.actions}>
                      <FunnelLink
                        event={HOST_FUNNEL_EVENTS.checkoutStarted}
                        properties={{ tier, interval: "monthly" }}
                        href={`/host/plans/activate?tier=${tier}&interval=monthly`}
                        className={styles.primaryButton}
                      >
                        Review {tierName(tier)} monthly
                      </FunnelLink>
                      <FunnelLink
                        event={HOST_FUNNEL_EVENTS.checkoutStarted}
                        properties={{ tier, interval: "yearly" }}
                        href={`/host/plans/activate?tier=${tier}&interval=yearly`}
                        className={styles.secondaryButton}
                      >
                        Review annual
                      </FunnelLink>
                    </span>
                  ) : (
                    <span className={styles.unavailable}>
                      Checkout isn&apos;t available on this environment yet.
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={styles.everyPlan}>
        <h3 className={styles.everyPlanTitle}>On every plan</h3>
        <ul className={styles.everyPlanList}>
          {ON_EVERY_PLAN.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
