import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./guidelines.module.css";

export const metadata: Metadata = {
  title: "Moderation guidelines",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Moderation guidelines & escalation — the operating manual for the admin OS.
 * Static, founder-owned reference content (no DB-backed data): the decision
 * rubric a moderator applies, the housing/meals/pay triad bar every listing
 * must clear, and the escalation ladder for irreversible calls. Reference only;
 * it never mutates marketplace state.
 */

interface DecisionRule {
  readonly verdict: "approve" | "hold" | "reject";
  readonly icon: IconKey;
  readonly title: string;
  readonly body: string;
}

const DECISIONS: ReadonlyArray<DecisionRule> = [
  {
    verdict: "approve",
    icon: "status.accepted",
    title: "Approve when the triad is honest",
    body: "Housing, meals, and pay are each disclosed in plain terms, the host is verified or low-risk, and the listing reads like a real opportunity — not a placeholder.",
  },
  {
    verdict: "hold",
    icon: "system.warning",
    title: "Hold when something is missing",
    body: "A vague pay line, undisclosed housing, or an unverified host carrying live listings is a hold — not a rejection. Route it back for the missing fact before it reaches seekers.",
  },
  {
    verdict: "reject",
    icon: "action.report",
    title: "Reject only for real harm",
    body: "Reject for safety risk, misrepresentation, or an unpaid role dressed as paid. Rejection closes the listing — reserve it for calls you would defend to the founder.",
  },
];

interface TriadBar {
  readonly icon: IconKey;
  readonly label: string;
  readonly bar: string;
}

const TRIAD: ReadonlyArray<TriadBar> = [
  {
    icon: "benefit.housing",
    label: "Housing",
    bar: "Where the seeker sleeps is stated — provided, assisted, or self-arranged. Never blank.",
  },
  {
    icon: "benefit.meals",
    label: "Meals",
    bar: "What they eat is stated — provided, partial, or self-catered. Never blank.",
  },
  {
    icon: "benefit.pay",
    label: "Pay",
    bar: "A real number or honest range. 'Competitive' is not a pay disclosure — hold it.",
  },
];

interface EscalationStep {
  readonly step: string;
  readonly title: string;
  readonly body: string;
}

const ESCALATION: ReadonlyArray<EscalationStep> = [
  {
    step: "1",
    title: "Decide in the queue",
    body: "Most calls are yours — approve, hold, or reject from the workbench. Speed matters; an aging queue is its own risk.",
  },
  {
    step: "2",
    title: "Flag the irreversible",
    body: "Trust revocation, mass closures, or anything that touches payments, schema, or a host's standing is a one-way door. Surface it before acting.",
  },
  {
    step: "3",
    title: "Escalate to the founder gate",
    body: "Pricing, real payments, verification policy, and permissions are founder-locked. When in doubt, hold and escalate — never improvise a policy.",
  },
];

export default function ModerationGuidelinesPage() {
  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <span className={styles.kicker}>
          <Icon name="nav.help" size={16} aria-hidden />
          Operating manual
        </span>
        <h1 className={styles.title}>Moderation guidelines</h1>
        <p className={styles.sub}>
          The rubric every decision runs through — what clears the bar, what to
          hold, and where a call stops being yours and becomes the founder&apos;s.
        </p>
      </header>

      {/* Decision rubric */}
      <div className={styles.block}>
        <h2 className={styles.blockTitle}>The decision rubric</h2>
        <ul className={styles.decisions}>
          {DECISIONS.map((rule) => (
            <li
              key={rule.verdict}
              className={styles.decision}
              data-verdict={rule.verdict}
            >
              <span className={styles.decisionIcon} aria-hidden="true">
                <Icon name={rule.icon} size={24} />
              </span>
              <div className={styles.decisionBody}>
                <h3 className={styles.decisionTitle}>{rule.title}</h3>
                <p className={styles.decisionText}>{rule.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Triad bar */}
      <div className={styles.block}>
        <h2 className={styles.blockTitle}>The triad bar — non-negotiable</h2>
        <p className={styles.blockNote}>
          Housing, meals, and pay are product law. A listing that hides any one
          of them does not ship — it is a hold, every time.
        </p>
        <ul className={styles.triad}>
          {TRIAD.map((item) => (
            <li key={item.label} className={styles.triadItem}>
              <span className={styles.triadIcon} aria-hidden="true">
                <Icon name={item.icon} size={24} />
              </span>
              <span className={styles.triadLabel}>{item.label}</span>
              <span className={styles.triadBar}>{item.bar}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Escalation ladder */}
      <div className={styles.block}>
        <h2 className={styles.blockTitle}>Escalation ladder</h2>
        <ol className={styles.ladder}>
          {ESCALATION.map((step) => (
            <li key={step.step} className={styles.ladderStep}>
              <span className={styles.ladderNum} aria-hidden="true">
                {step.step}
              </span>
              <div className={styles.ladderBody}>
                <h3 className={styles.ladderTitle}>{step.title}</h3>
                <p className={styles.ladderText}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.footRow}>
        <Link className={styles.foot} href="/applications">
          <Icon name="action.apply" size={20} aria-hidden />
          Back to the review queue
        </Link>
        <Link className={styles.footGhost} href="/admin">
          <Icon name="analytics.meter" size={20} aria-hidden />
          Marketplace overview
        </Link>
      </div>
    </section>
  );
}
