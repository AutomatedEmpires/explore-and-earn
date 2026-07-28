import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { formatCompensation } from "../../lib/format";
import { SitePhoto } from "../media/SitePhoto";
import {
  DEMO_ROLES,
  DEMO_STAGE_LABEL,
  applicantsForRole,
  deriveRolePerformance,
  tallyByStage,
  type DemoApplicant,
  type DemoRole,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The role inventory and the role detail.
 *
 * EVERY CARD CARRIES A PHOTOGRAPH from the site-photo catalog, chosen by
 * category: paddle and dock scenes for the water roles, a lodge for the desk
 * role, a trail for the grounds crew, a kitchen for the evening team. The alt
 * text comes from the catalog and describes the scene — a photograph here is
 * imagery for a KIND of work, never a claim about a person in the frame.
 *
 * A DRAFT SHOWS NO PERFORMANCE. Drafts are not discoverable, take no
 * applications, and therefore have nothing to report; the card says that in
 * words instead of rendering zeroes that look like failure.
 */

function payRange(role: DemoRole): string {
  // Through the formatter chokepoint (lib/format), never hand-built: a demo
  // that formats money its own way is a demo that will disagree with the
  // product the first time the currency or locale moves.
  return formatCompensation({
    minCents: role.payMinCents,
    maxCents: role.payMaxCents,
    unit: "hour",
  });
}

export function DemoRoleCard({
  role,
  applicants,
}: {
  readonly role: DemoRole;
  readonly applicants: readonly DemoApplicant[];
}) {
  const forRole = applicantsForRole(role.id, applicants);
  const tally = tallyByStage(forRole);
  const isDraft = role.status === "draft";

  return (
    <article className={styles.roleCard} data-status={role.status}>
      <div className={styles.rolePhoto}>
        <SitePhoto
          slug={role.photoSlug}
          size="card"
          sizes="(min-width: 1000px) 360px, (min-width: 720px) 50vw, 100vw"
        />
        <div className={styles.roleBadges}>
          {isDraft ? (
            <span className={`${styles.rolePill} ${styles.rolePillDraft}`}>
              <Icon name="status.draft" size={12} aria-hidden />
              Draft — not discoverable
            </span>
          ) : (
            <span className={`${styles.rolePill} ${styles.rolePillLive}`}>
              <Icon name="status.open" size={12} aria-hidden />
              Live
            </span>
          )}
          {role.closingSoon ? (
            <span className={`${styles.rolePill} ${styles.rolePillClosing}`}>
              <Icon name="status.ends" size={12} aria-hidden />
              Closes in {role.deadlineDaysAway} days
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.roleBody}>
        <h3 className={styles.roleTitle}>{role.title}</h3>
        <p className={styles.roleSummary}>{role.summary}</p>

        <div className={styles.roleMeta}>
          <span className={styles.rolePill}>
            <Icon name="benefit.pay" size={12} aria-hidden />
            {payRange(role)}
          </span>
          <span className={styles.rolePill}>
            <Icon name="benefit.housing" size={12} aria-hidden />
            {role.housing.costCents === 0 ? "Housing included" : "Housing at cost"}
          </span>
          <span className={styles.rolePill}>
            <Icon name="status.begins" size={12} aria-hidden />
            {role.opportunityWindow}
          </span>
          <span className={styles.rolePill}>
            <Icon name="nav.seekers" size={12} aria-hidden />
            {role.openPositions} positions
          </span>
        </div>

        {isDraft ? (
          <p className={styles.roleSummary}>
            A draft costs nothing and takes no applications. There are no figures
            here because nothing has happened yet.
          </p>
        ) : (
          <div className={styles.roleStats}>
            <div className={styles.roleStat}>
              <span className={styles.roleStatLabel}>Applications</span>
              <span className={styles.roleStatValue}>{forRole.length}</span>
            </div>
            <div className={styles.roleStat}>
              <span className={styles.roleStatLabel}>Views</span>
              <span className={styles.roleStatValue}>
                {role.views.toLocaleString()}
              </span>
            </div>
            <div className={styles.roleStat}>
              <span className={styles.roleStatLabel}>Saves</span>
              <span className={styles.roleStatValue}>{role.saves}</span>
            </div>
            <div className={styles.roleStat}>
              <span className={styles.roleStatLabel}>
                {DEMO_STAGE_LABEL.offer} · {DEMO_STAGE_LABEL.accepted}
              </span>
              <span className={styles.roleStatValue}>
                {tally.offer} · {tally.accepted}
              </span>
            </div>
          </div>
        )}

        <DemoLabel text={role.demoLabel} />
      </div>
    </article>
  );
}

/** The busy inventory. Never empty: seven roles, two of them honest drafts. */
export function DemoRoleInventory({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  return (
    <div className={styles.roleGrid} id={id}>
      {DEMO_ROLES.map((role) => (
        <DemoRoleCard key={role.id} role={role} applicants={applicants} />
      ))}
    </div>
  );
}

/**
 * Rich listing-performance cards for the overview (spec D24).
 *
 * Each carries the role's own ratios AND the diagnosis those ratios produced.
 * The diagnosis is a branch over measured values in enterpriseDemo.ts, so it
 * cannot say "converting well" about a role that is not.
 */
export function DemoRolePerformanceCards({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  const performance = deriveRolePerformance(applicants);

  return (
    <div className={styles.roleGrid} id={id}>
      {performance.map((entry) => (
        <article
          key={entry.role.id}
          className={styles.roleCard}
          data-status={entry.role.status}
        >
          <div className={styles.rolePhoto}>
            <SitePhoto
              slug={entry.role.photoSlug}
              size="card"
              sizes="(min-width: 1000px) 360px, (min-width: 720px) 50vw, 100vw"
            />
          </div>
          <div className={styles.roleBody}>
            <h3 className={styles.roleTitle}>{entry.role.title}</h3>
            <div className={styles.roleStats}>
              <div className={styles.roleStat}>
                <span className={styles.roleStatLabel}>Applications</span>
                <span className={styles.roleStatValue}>{entry.applications}</span>
              </div>
              <div className={styles.roleStat}>
                <span className={styles.roleStatLabel}>View to application</span>
                <span className={styles.roleStatValue}>
                  {entry.viewToApplication.toFixed(1)}%
                </span>
              </div>
              <div className={styles.roleStat}>
                <span className={styles.roleStatLabel}>Save rate</span>
                <span className={styles.roleStatValue}>
                  {entry.saveRate.toFixed(1)}%
                </span>
              </div>
              <div className={styles.roleStat}>
                <span className={styles.roleStatLabel}>Qualified</span>
                <span className={styles.roleStatValue}>{entry.qualified}</span>
              </div>
            </div>
            <p className={styles.roleDiagnosis}>{entry.diagnosis}</p>
            <DemoLabel text={entry.role.demoLabel} />
          </div>
        </article>
      ))}
    </div>
  );
}

/** The full role, as it is written. */
export function DemoRoleDetail({
  role,
  applicants,
}: {
  readonly role: DemoRole;
  readonly applicants: readonly DemoApplicant[];
}) {
  const forRole = applicantsForRole(role.id, applicants);

  return (
    <>
      <div className={styles.detailHero}>
        <SitePhoto
          slug={role.photoSlug}
          size="hero"
          priority
          sizes="(min-width: 1120px) 1120px, 100vw"
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{role.title}</h2>
            <p className={styles.panelNote}>
              {role.begins} – {role.ends} · {role.hoursPerWeek} ·{" "}
              {role.openPositions} positions ·{" "}
              {forRole.length} applications so far
            </p>
          </div>
          <DemoLabel text={role.demoLabel} />
        </div>

        <div className={styles.triadRow}>
          <div className={`${styles.triadCell} ${styles.triadHousing}`}>
            <span className={styles.triadIcon}>
              <Icon name="benefit.housing" size={20} aria-hidden />
            </span>
            <span>
              <span className={styles.triadLabel}>Housing</span>
              <span className={styles.triadValue}>{role.housing.type}</span>
            </span>
          </div>
          <div className={`${styles.triadCell} ${styles.triadMeals}`}>
            <span className={styles.triadIcon}>
              <Icon name="benefit.meals" size={20} aria-hidden />
            </span>
            <span>
              <span className={styles.triadLabel}>Meals</span>
              <span className={styles.triadValue}>
                {role.meals.costCents === 0
                  ? "Two crew meals a day, included"
                  : "Meals available at cost"}
              </span>
            </span>
          </div>
          <div className={`${styles.triadCell} ${styles.triadPay}`}>
            <span className={styles.triadIcon}>
              <Icon name="benefit.pay" size={20} aria-hidden />
            </span>
            <span>
              <span className={styles.triadLabel}>Pay</span>
              <span className={styles.triadValue}>{payRange(role)}</span>
            </span>
          </div>
        </div>

        <div className={styles.prose}>
          {role.description.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      </div>

      <div className={styles.detailColumns}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>The schedule</h3>
          </div>
          <ul className={styles.checkList}>
            {role.schedule.map((line) => (
              <li key={line} className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="status.begins" size={16} aria-hidden />
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>What we need from you</h3>
          </div>
          <ul className={styles.checkList}>
            {role.requirements.map((line) => (
              <li key={line} className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="system.success" size={16} aria-hidden />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>What is included</h3>
          </div>
          <ul className={styles.checkList}>
            <li className={styles.checkItem}>
              <span className={styles.checkIcon}>
                <Icon name="benefit.housing" size={16} aria-hidden />
              </span>
              {role.housing.summary}
            </li>
            <li className={styles.checkItem}>
              <span className={styles.checkIcon}>
                <Icon name="benefit.meals" size={16} aria-hidden />
              </span>
              {role.meals.summary}
            </li>
            {role.benefits.map((benefit) => (
              <li key={benefit} className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="system.success" size={16} aria-hidden />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
          <p className={styles.panelNote}>{role.payNote}</p>
          {role.deadline ? (
            <p className={styles.panelNote}>
              Applications close {role.deadline}.
            </p>
          ) : (
            <p className={styles.panelNote}>
              This role is a draft, so there is no deadline and no application
              route yet.
            </p>
          )}
        </div>
      </div>

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          <Icon name="nav.host" size={18} aria-hidden />
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/seeker-view">
          See it as a seeker
        </Link>
      </div>
    </>
  );
}
