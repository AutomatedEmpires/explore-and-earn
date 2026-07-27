import Link from "next/link";

import { ANNUAL_MONTHS_BILLED } from "@explore-and-earn/contracts";

import { formatDate, formatMoney } from "../../lib/format";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics";
import { SectionViewed } from "../analytics/SectionViewed";
import { FoundingCountdown } from "./FoundingCountdown";
import {
  FOUNDING_TERMS,
  foundingRateCents,
  type FoundingProgramView,
} from "./program";
import styles from "./founding.module.css";

/**
 * The public founding-host section.
 *
 * FOUR STATES, ONE OF WHICH IS SILENCE. Everything quantitative on this surface
 * comes from `view`, which is produced by ./program from a database row the
 * founder wrote. Until that row exists and is open, this section renders one
 * qualitative sentence and no figure of any kind: no capacity, no remainder, no
 * countdown, no "limited places". Guardrail G53 fails the build if this file
 * reads a count from anywhere else.
 *
 * The RATES are shown in every state except silence, and that is deliberate: a
 * price is a fact about the offer, not a scarcity claim, and a host deciding
 * whether to wait for the next window deserves to know what they would be
 * waiting for. What is never shown outside the open state is a NUMBER OF SEATS
 * or a DATE, because those are the two facts that create urgency and neither is
 * true unless the founder set it.
 *
 * The three tier prices are rendered from FOUNDING_LOCKED_PRICING through
 * ./program's accessor; nothing here states an amount of its own, which is what
 * the pricing guardrail enforces.
 */

const FOUNDING_TIERS = ["starter", "professional", "enterprise"] as const;
type FoundingTierKey = (typeof FOUNDING_TIERS)[number];

function tierName(tier: FoundingTierKey): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export interface FoundingHostSectionProps {
  readonly view: FoundingProgramView;
  /** Where the primary action goes. Defaults to the plan chooser. */
  readonly ctaHref?: string;
  readonly className?: string;
}

export function FoundingHostSection({
  view,
  ctaHref = "/host/plans",
  className,
}: FoundingHostSectionProps) {
  // NOTHING AT ALL is also an acceptable answer here; a single sentence was
  // chosen over silence because a host who hears about the program elsewhere
  // should be able to find out that it is real and not yet open, rather than
  // conclude the page is hiding it.
  if (view.state === "unconfigured") {
    return (
      <section
        id="founding"
        className={`${styles.section} ${className ?? ""}`}
        aria-labelledby="founding-title"
      >
        <SectionViewed event={HOST_FUNNEL_EVENTS.foundingSectionViewed} />
        <h2 id="founding-title" className={styles.title}>
          A programme for early hosts is coming
        </h2>
        <p className={styles.lead}>
          We are preparing a discounted rate for the hosts who join first. It is
          not open yet, and we would rather say that than count down to a date
          nobody has chosen.
        </p>
      </section>
    );
  }

  const terminal = view.state === "full" || view.state === "ended";

  return (
    <section
      id="founding"
      className={`${styles.section} ${className ?? ""}`}
      aria-labelledby="founding-title"
      data-state={view.state}
    >
      <SectionViewed event={HOST_FUNNEL_EVENTS.foundingSectionViewed} />

      <div className={styles.head}>
        <p className={styles.eyebrow}>Early hosts</p>
        <h2 id="founding-title" className={styles.title}>
          {view.state === "open"
            ? "Join at the early-host rate"
            : view.state === "full"
              ? "Every early-host place is taken"
              : "Early-host enrolment has closed"}
        </h2>

        {/* THE ONLY PLACE A COUNT APPEARS, and only when there is one. */}
        {view.state === "open" && view.counts ? (
          <p className={styles.scarcity}>
            <strong>
              {view.counts.remaining} of {view.counts.capacity}
            </strong>{" "}
            {view.counts.remaining === 1 ? "place remains" : "places remain"}.
          </p>
        ) : null}

        {view.state === "full" && view.counts ? (
          <p className={styles.scarcity}>
            All <strong>{view.counts.capacity}</strong> places have been claimed.
            The standard plans below are unchanged and available now.
          </p>
        ) : null}

        {view.state === "ended" ? (
          <p className={styles.scarcity}>
            Enrolment is closed. The standard plans below are unchanged and
            available now.
          </p>
        ) : null}

        {/* The deadline as STATIC SERVER-RENDERED TEXT first. The countdown
            beside it is decoration that ticks toward this same instant; without
            JavaScript the date is still there, and with it nothing is invented. */}
        {view.state === "open" && view.deadlineIso ? (
          <>
            <p className={styles.deadline}>
              Enrolment closes on{" "}
              <time dateTime={view.deadlineIso}>
                {formatDate(view.deadlineIso, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              .
            </p>
            <FoundingCountdown deadlineIso={view.deadlineIso} />
          </>
        ) : null}
      </div>

      <ul className={styles.rates}>
        {FOUNDING_TIERS.map((tier) => (
          <li key={tier} className={styles.rate}>
            <span className={styles.rateName}>{tierName(tier)}</span>
            <span className={styles.rateMonthly}>
              {formatMoney(foundingRateCents(tier, "monthly"))}
              <span className={styles.ratePer}>/mo</span>
            </span>
            <span className={styles.rateAnnual}>
              or {formatMoney(foundingRateCents(tier, "yearly"))} a year
            </span>
          </li>
        ))}
      </ul>

      <p className={styles.annualNote}>
        Annual billing is {ANNUAL_MONTHS_BILLED} monthly payments taken once a
        year — two months free — at the rate above.
      </p>

      <ul className={styles.terms}>
        {FOUNDING_TERMS.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>

      {!terminal ? (
        <Link className={styles.cta} href={ctaHref}>
          Choose a plan at this rate
        </Link>
      ) : null}
    </section>
  );
}
