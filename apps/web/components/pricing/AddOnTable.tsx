import {
  ADDITIONAL_LISTING_PRICING,
  ADDON_PRICING,
  BOOST_DURATIONS,
  BOOST_PRICING,
  INVITE_CREDIT_PACKS,
  type BoostDuration,
} from "@explore-and-earn/contracts";

import { formatMoney } from "../../lib/format";
import styles from "./addons.module.css";

/**
 * What sits on top of a plan, and what it costs.
 *
 * PRESENTATION ONLY. Every one of these already has a working purchase flow
 * inside the host workspace — boost from the listings page, extra announcement
 * runs from the community tab, extra active listings and invite packs from
 * settings and billing. This component adds no checkout and starts no purchase;
 * it exists because the prices were reachable only by finding the surface that
 * sells them, which meant a host evaluating the platform could not see the whole
 * cost of what they were about to run.
 *
 * EVERY FIGURE IS DERIVED. ADDON_PRICING, ADDITIONAL_LISTING_PRICING,
 * BOOST_PRICING and INVITE_CREDIT_PACKS are the founder-locked contract; this
 * file states no amount and no duration of its own, which is what the pricing
 * guardrail enforces and what stops a marketing table drifting away from the
 * number the server charges.
 *
 * ELIGIBILITY IS STATED, not implied. Add-ons extend a plan's allowance, and
 * ADDITIONAL_LISTING_PRICING deliberately has no unsubscribed rate — quoting one
 * would sell a plan's allowance without the plan. So the eligibility line says
 * "paid plans" once, at the top, rather than being discovered at checkout.
 */

const PAID_TIERS = ["starter", "professional", "enterprise"] as const;

function tierName(tier: (typeof PAID_TIERS)[number]): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export interface AddOnTableProps {
  readonly className?: string;
  /** Rendered as an h2 by default; the activation page nests it under one. */
  readonly headingLevel?: "h2" | "h3";
}

export function AddOnTable({ className, headingLevel = "h2" }: AddOnTableProps) {
  const Heading = headingLevel;

  return (
    <section
      id="plan-add-ons"
      className={`${styles.section} ${className ?? ""}`}
      aria-labelledby="addons-title"
    >
      <div className={styles.head}>
        <Heading id="addons-title" className={styles.title}>
          Add-ons
        </Heading>
        <p className={styles.lead}>
          Everything below sits on top of a plan and is bought when you need it,
          from inside your workspace. Add-ons extend a plan&rsquo;s allowance, so
          they are available to hosts on a paid plan — there is no rate at which
          an unsubscribed account can buy one.
        </p>
      </div>

      <div className={styles.groups}>
        {/* ── Extra active listings ─────────────────────────────────── */}
        <article className={styles.group}>
          <h3 className={styles.groupTitle}>Additional active listing</h3>
          <p className={styles.groupMeta}>Monthly, per extra listing</p>
          <ul className={styles.rows}>
            {PAID_TIERS.map((tier) => (
              <li key={tier} className={styles.row}>
                <span className={styles.rowLabel}>
                  On {tierName(tier)}
                </span>
                <span className={styles.rowPrice}>
                  {formatMoney(ADDITIONAL_LISTING_PRICING[tier])}
                  <span className={styles.rowUnit}>/mo</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.groupNote}>
            The marginal listing gets cheaper on the higher plans. Priced per
            extra active listing beyond the count your plan includes.
          </p>
        </article>

        {/* ── Boost ─────────────────────────────────────────────────── */}
        <article className={styles.group}>
          <h3 className={styles.groupTitle}>Listing boost</h3>
          <p className={styles.groupMeta}>One-off, per listing</p>
          <ul className={styles.rows}>
            {BOOST_DURATIONS.map((days: BoostDuration) => (
              <li key={days} className={styles.row}>
                <span className={styles.rowLabel}>{days} days</span>
                <span className={styles.rowPrice}>
                  {formatMoney(BOOST_PRICING[days])}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.groupNote}>
            Exposure only. A boost moves a listing up in discovery for a fixed
            window and never changes a match score — a score you could buy would
            be worth nothing to either side.
          </p>
        </article>

        {/* ── Announcements ─────────────────────────────────────────── */}
        <article className={styles.group}>
          <h3 className={styles.groupTitle}>Extra community announcement</h3>
          <p className={styles.groupMeta}>One-off, per run</p>
          <ul className={styles.rows}>
            <li className={styles.row}>
              <span className={styles.rowLabel}>
                {ADDON_PRICING.additionalAnnouncement.runDays}-day run
              </span>
              <span className={styles.rowPrice}>
                {formatMoney(ADDON_PRICING.additionalAnnouncement.priceCents)}
              </span>
            </li>
          </ul>
          <p className={styles.groupNote}>
            A single run of a fixed length — there are no duration options. Extra
            runs are in addition to the announcements your plan includes, never a
            substitute for them.
          </p>
        </article>

        {/* ── Invite credit packs ───────────────────────────────────── */}
        <article className={styles.group}>
          <h3 className={styles.groupTitle}>Invite credit packs</h3>
          <p className={styles.groupMeta}>One-off, never expires monthly</p>
          <ul className={styles.rows}>
            {INVITE_CREDIT_PACKS.map((pack) => (
              <li key={pack.credits} className={styles.row}>
                <span className={styles.rowLabel}>{pack.credits} credits</span>
                <span className={styles.rowPrice}>
                  {formatMoney(pack.priceCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.groupNote}>
            Purchased credits extend your monthly allowance and carry over.
            Invite credits are non-refundable once bought, which is stated at the
            point of purchase rather than in the small print.
          </p>
        </article>
      </div>
    </section>
  );
}
