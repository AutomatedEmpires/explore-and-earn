import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_ANALYTICS_LABEL,
  DEMO_ANNOUNCEMENTS,
  DEMO_ANNOUNCEMENT_WITH_PERFORMANCE,
  DEMO_DATA_LABEL,
  DEMO_ORG,
  announcementsThisPeriod,
  type DemoAnnouncementStatus,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The announcement history, the composer PREVIEW, and one performance view.
 *
 * A DRAFT AND A SCHEDULED RUN CARRY NO ENGAGEMENT FIGURES, and that is the
 * point: numbers appear only against announcements that actually ran. Inventing
 * "expected reach" for something that has not been sent is the exact class of
 * claim the honesty rules forbid, and the fixture type makes it hard to get
 * wrong — `engagement` is nullable and the integrity test asserts which
 * statuses may carry it.
 */

const STATUS_CLASS: Record<DemoAnnouncementStatus, string> = {
  published: "statusPublished",
  scheduled: "statusScheduled",
  draft: "statusDraft",
};

const STATUS_LABEL: Record<DemoAnnouncementStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
};

const KIND_LABEL: Record<"general" | "hiring" | "event", string> = {
  general: "General",
  hiring: "Now hiring",
  event: "Event",
};

export function DemoAnnouncementList({ id }: { readonly id?: string }) {
  return (
    <ul className={styles.announceList} id={id}>
      {DEMO_ANNOUNCEMENTS.map((announcement) => (
        <li key={announcement.id} className={styles.announce}>
          <div className={styles.announceTop}>
            <span
              className={`${styles.statusPill} ${styles[STATUS_CLASS[announcement.status]]}`}
            >
              {STATUS_LABEL[announcement.status]}
            </span>
            <h3 className={styles.announceTitle}>{announcement.title}</h3>
            <DemoLabel text={announcement.demoLabel} />
          </div>
          <p className={styles.announceBody}>{announcement.body}</p>
          <div className={styles.announceMeta}>
            <span>{KIND_LABEL[announcement.kind]}</span>
            <span>Audience: {announcement.audience}</span>
            <span>
              {announcement.dateLabel}
              {announcement.date ? ` ${announcement.date}` : ""}
            </span>
            <span>
              {announcement.inCurrentPeriod
                ? "Draws on this period's allowance"
                : "Earlier billing period"}
            </span>
          </div>
          {announcement.engagement ? (
            <div className={styles.engagementRow}>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.views.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Views</span>
              </span>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.opens.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Opened</span>
              </span>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.saves.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Roles saved after</span>
              </span>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.applications.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Applications</span>
              </span>
            </div>
          ) : (
            <p className={styles.noEngagement}>
              No results yet — this one has not run.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The performance view for one published run.
 *
 * Ratios are computed from the four stored counts, so the "opened" rate and the
 * "applied" rate cannot contradict the numbers printed beside them.
 */
export function DemoAnnouncementPerformance({ id }: { readonly id?: string }) {
  const announcement = DEMO_ANNOUNCEMENTS.find(
    (entry) => entry.id === DEMO_ANNOUNCEMENT_WITH_PERFORMANCE,
  );
  if (!announcement || !announcement.engagement) return null;
  const { views, opens, saves, applications } = announcement.engagement;
  const openRate = views === 0 ? 0 : (opens / views) * 100;
  const applyRate = opens === 0 ? 0 : (applications / opens) * 100;

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>
            What &ldquo;{announcement.title}&rdquo; did
          </h2>
          <p className={styles.panelNote}>
            Published {announcement.date} to {announcement.audience.toLowerCase()}.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <div className={styles.roleStats}>
        <div className={styles.roleStat}>
          <span className={styles.roleStatLabel}>Views</span>
          <span className={styles.roleStatValue}>{views.toLocaleString()}</span>
        </div>
        <div className={styles.roleStat}>
          <span className={styles.roleStatLabel}>Opened</span>
          <span className={styles.roleStatValue}>
            {opens.toLocaleString()} · {openRate.toFixed(1)}%
          </span>
        </div>
        <div className={styles.roleStat}>
          <span className={styles.roleStatLabel}>Roles saved after</span>
          <span className={styles.roleStatValue}>{saves.toLocaleString()}</span>
        </div>
        <div className={styles.roleStat}>
          <span className={styles.roleStatLabel}>Applications</span>
          <span className={styles.roleStatValue}>
            {applications.toLocaleString()} · {applyRate.toFixed(1)}% of opens
          </span>
        </div>
      </div>
      <p className={styles.panelNote}>
        Opens and applications are attributed to the run, not to the season: an
        announcement that reaches people who were going to apply anyway has not
        earned the credit.
      </p>
    </div>
  );
}

/**
 * The composer, as a PREVIEW.
 *
 * The production composer is a form bound to server actions and a live monthly
 * quota. Rendering it here would put a publish button on a page with no host
 * and no quota to spend, so this shows the shape of the form and states the
 * allowance from the contract — with every control inert and labelled as such.
 */
export function DemoAnnouncementComposerPreview({
  id,
}: {
  readonly id?: string;
}) {
  const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
  const used = announcementsThisPeriod();
  const remaining = Math.max(0, entitlement.monthlyAnnouncements - used);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Write an announcement</h2>
          <p className={styles.panelNote}>
            {used} of {entitlement.monthlyAnnouncements} runs used this period
            {remaining === 0
              ? " — the next one this period is a single purchase."
              : ` — ${remaining} left.`}
          </p>
        </div>
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>

      <div className={styles.composerPreview}>
        <p className={styles.composerField}>Headline</p>
        <p className={styles.composerField}>
          What has changed, and who it matters to…
        </p>
        <div className={styles.roleMeta}>
          <span className={styles.rolePill}>
            <Icon name="nav.announcements" size={12} aria-hidden />
            Now hiring
          </span>
          <span className={styles.rolePill}>General</span>
          <span className={styles.rolePill}>Event</span>
        </div>
        <p className={styles.calloutBody}>
          Publishing is disabled in the demo. Nothing written on this page is
          stored, scheduled, or sent to anybody.
        </p>
      </div>
    </div>
  );
}
