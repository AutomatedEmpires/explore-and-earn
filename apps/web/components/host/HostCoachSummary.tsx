"use client";

import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import styles from "./HostCoachSummary.module.css";

/**
 * The Recruiting Coach's workspace summary (V2 D26).
 *
 * THIS IS THE PART THAT WORKS WITHOUT THE MODEL, and that is the whole design.
 * The pre-V2 coach was a chat box and four suggested prompts: with no gateway
 * key it rendered "isn't available in this environment yet" and nothing else,
 * and with a key it opened on an empty transcript that told the host nothing
 * they did not already know. Everything below is computed on the server from
 * the host's own rows before a model is consulted, so the page is useful in
 * both states and the chat becomes the SECOND thing on it.
 *
 * NOTHING HERE IS INVENTED. Every recommendation names the count it came from
 * and links to the record it is about — that is what "evidence-linked" means in
 * D25/D26, and it is also the cheapest defence against the failure mode this
 * surface invites, which is a confident sentence about a listing that does not
 * exist. The fixture-isolation suite pins that the (host) tree imports no demo
 * data, so a recommendation cannot be sourced from the demo workspace.
 */

/** One actionable finding. `evidenceHref` is what makes it checkable. */
export interface CoachRecommendation {
  readonly id: string;
  /** Grouping for analytics — never rendered. */
  readonly kind:
    | "listing_quality"
    | "closing_soon"
    | "unanswered"
    | "new_applicants"
    | "outreach"
    | "setup";
  readonly icon: IconKey;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly actionHref: string;
}

export interface HostCoachSummaryProps {
  /**
   * One line naming the rows every finding below was read from, e.g.
   * "Based on your 3 live listings and 12 applications." Rendered verbatim so
   * the page states its own sources before it states any conclusion.
   */
  readonly dataSource: string;
  readonly recommendations: readonly CoachRecommendation[];
  /** True when a model is reachable; changes what the summary promises. */
  readonly assistantConfigured: boolean;
}

export function HostCoachSummary({
  dataSource,
  recommendations,
  assistantConfigured,
}: HostCoachSummaryProps) {
  return (
    <section className={styles.summary} aria-labelledby="coach-summary-heading">
      <div className={styles.head}>
        <h2 id="coach-summary-heading" className={styles.title}>
          Your workspace right now
        </h2>
        <p className={styles.source}>
          <Icon name="system.info" size={16} aria-hidden />
          {dataSource}
        </p>
      </div>

      {recommendations.length === 0 ? (
        <p className={styles.clear}>
          Nothing needs attention. Every listing has its housing, meals, pay and
          dates filled in, and no applicant or message is waiting on you.
        </p>
      ) : (
        <ul className={styles.list}>
          {recommendations.map((recommendation) => (
            <li key={recommendation.id} className={styles.item}>
              <span className={styles.itemIcon}>
                <Icon name={recommendation.icon} size={18} aria-hidden />
              </span>
              <div className={styles.itemBody}>
                <h3 className={styles.itemTitle}>{recommendation.title}</h3>
                <p className={styles.itemDetail}>{recommendation.detail}</p>
              </div>
              <Link
                className={styles.itemAction}
                href={recommendation.actionHref}
                onClick={() =>
                  captureFunnelEvent(HOST_WORKSPACE_EVENTS.coachRecommendationOpened, {
                    kind: recommendation.kind,
                  })
                }
              >
                {recommendation.actionLabel}
                <Icon name="action.forward" size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Said on the page rather than left to be inferred from a missing button.
        The assistant's six host tools are all readers — none of them writes —
        so there is no confirmation step to show, and claiming one would be a
        safety promise about a capability that does not exist. The isolation
        test fails the build if a mutating tool is ever added, which is the
        moment this sentence has to change.
      */}
      <p className={styles.boundary}>
        The Coach reads your listings and applicants. It never publishes, sends
        a message, or changes a record — every action stays with you.
        {assistantConfigured
          ? " Ask it anything below; the summary above does not need it."
          : " The chat needs a model that is not configured in this environment; the summary above is computed from your own records and works regardless."}
      </p>
    </section>
  );
}
