import Link from "next/link";
import {
  Icon,
  MetricCard,
  MetricGrid,
  VerifiedHostBadge,
  type IconKey,
} from "@explore-and-earn/ui";

import { sparkFromCount } from "../../lib/sparkline";
import {
  deriveHostProfileReadiness,
  type HostProfileReadinessField,
  type HostProfileReadinessInput,
} from "./hostReadiness";
import {
  resolveHostProfileReadinessInput,
  type HostProfileSummary,
  type HostStats,
} from "./models";
import styles from "./HostProfilePanel.module.css";

export interface HostProfilePanelProps {
  readonly profile: HostProfileSummary;
  readonly stats: HostStats;
  /** Where the "Edit public profile" CTA routes. Presentation only. */
  readonly editHref?: string;
  /** Raw persisted fields; explicit null means no host profile exists. */
  readonly readinessProfile?: HostProfileReadinessInput | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Multi-category",
};

const CATEGORY_ICON: Record<string, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

/**
 * Profile-strength signals shown beside the editor. PRESENTATION ONLY — these
 * are readiness hints derived from public identity fields the host controls:
 * organization, story, location, photo, and categories. Subscription-gated
 * verification and truthful "not offered" benefit states do not affect profile
 * completion. No scoring/matching is computed here.
 */
interface ChecklistRow {
  readonly label: string;
  readonly hint: string;
  readonly done: boolean;
}

const PROFILE_CHECKLIST_COPY: Record<
  HostProfileReadinessField,
  Pick<ChecklistRow, "label" | "hint">
> = {
  company: {
    label: "Name your organization",
    hint: "Use the organization name seekers will recognize.",
  },
  story: {
    label: "Write a public bio",
    hint: "Describe your operation, crew, and what the work feels like.",
  },
  location: {
    label: "Add your home base",
    hint: "Seekers plan travel by region — show where you are.",
  },
  photo: {
    label: "Add a profile photo",
    hint: "Give seekers a real visual identity for your organization.",
  },
  categories: {
    label: "Choose your categories",
    hint: "Place your opportunities in Farm, Maritime, Remote, or Seasonal.",
  },
};

function buildChecklist(
  readinessInput: HostProfileReadinessInput,
): readonly ChecklistRow[] {
  const readiness = deriveHostProfileReadiness(readinessInput);
  const missing = new Set(readiness.missing);
  return (Object.keys(PROFILE_CHECKLIST_COPY) as HostProfileReadinessField[]).map(
    (key) => ({
      ...PROFILE_CHECKLIST_COPY[key],
      done: !missing.has(key),
    }),
  );
}

/**
 * Profile strength as a 0–100 figure DERIVED from the checklist completion —
 * never a stored/scored number. Presentation only.
 */
function deriveProfileStrength(rows: readonly ChecklistRow[]): number {
  if (rows.length === 0) return 0;
  const done = rows.filter((r) => r.done).length;
  return Math.round((done / rows.length) * 100);
}

export function HostProfilePanel({
  profile,
  stats,
  editHref = "/host/profile/edit",
  readinessProfile,
}: HostProfilePanelProps) {
  const checklist = buildChecklist(
    resolveHostProfileReadinessInput(profile, readinessProfile),
  );
  const strength = deriveProfileStrength(checklist);
  const completeCount = checklist.filter((r) => r.done).length;

  const tags = (profile.categoryScopes ?? []).filter(Boolean);

  return (
    <section className={styles.panel}>
      {/* ── Cinematic profile hero ── */}
      <header className={styles.hero}>
        <div className={styles.heroScrim} aria-hidden />
        <span className={styles.kicker}>
          <span className={styles.kickerDot} aria-hidden />
          Public host profile
        </span>

        <div className={styles.heroCard}>
          <div className={styles.heroBody}>
            <div className={styles.nameRow}>
              <h2 className={styles.name}>{profile.orgName}</h2>
              {profile.verified ? <VerifiedHostBadge /> : null}
            </div>

            <p className={styles.hostedBy}>
              Hosted by {profile.hostName}
              {profile.location ? (
                <span className={styles.locationMeta}>
                  <Icon name="nav.map" size={16} aria-hidden />
                  {profile.location}
                </span>
              ) : null}
            </p>

            {profile.tagline ? (
              <p className={styles.tagline}>{profile.tagline}</p>
            ) : null}

            {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}

            {tags.length > 0 ? (
              <div className={styles.tags}>
                {tags.map((scope) => (
                  <span key={scope} className={styles.tag}>
                    <Icon
                      name={CATEGORY_ICON[scope] ?? "category.mix"}
                      size={16}
                      aria-hidden
                    />
                    {CATEGORY_LABEL[scope] ?? scope}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.heroAction}>
            <Link
              href={editHref}
              className={`ui-button ui-button--primary ${styles.editLink}`}
            >
              <Icon name="action.edit" size={20} aria-hidden />
              <span className="ui-button__label">Edit public profile</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Profile-strength metrics ── */}
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Profile strength"
          value={`${strength}%`}
          trend={strength >= 80 ? "Excellent" : strength >= 50 ? "Building" : "Get started"}
          trendTone={strength >= 80 ? "up" : "neutral"}
          spark={sparkFromCount(strength)}
        />
        <MetricCard
          label="Active listings"
          value={stats.activeListings}
          trend={stats.activeListings > 0 ? "Live" : "None live"}
          trendTone={stats.activeListings > 0 ? "up" : "down"}
          spark={sparkFromCount(stats.activeListings)}
        />
        <MetricCard
          label="Total applicants"
          value={stats.totalApplicants}
          trend={stats.newApplicants > 0 ? `${stats.newApplicants} new` : "Quiet"}
          trendTone={stats.newApplicants > 0 ? "up" : "neutral"}
          spark={sparkFromCount(stats.totalApplicants)}
        />
      </MetricGrid>

      {/* ── Editor intro + conversion checklist split ── */}
      <div className={styles.split}>
        <div className={styles.editorCard}>
          <div className={styles.editorHead}>
            <div>
              <h3 className={styles.editorTitle}>Make the host story convert</h3>
              <p className={styles.editorLede}>
                Your public profile should be visual, credible, specific, and
                conversion-oriented. Keep HOUSING, MEALS, and PAY upfront on every
                listing — that triad is what seekers decide on.
              </p>
            </div>
            <span className={styles.editorBadge}>{strength}%</span>
          </div>

          <ul className={styles.summaryList}>
            <li className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Home base</span>
              <span className={styles.summaryValue}>
                {profile.location ?? "Not set"}
              </span>
            </li>
            <li className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Categories</span>
              <span className={styles.summaryValue}>
                {tags.length > 0
                  ? tags.map((t) => CATEGORY_LABEL[t] ?? t).join(" · ")
                  : "Not set"}
              </span>
            </li>
            <li className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Housing</span>
              <span className={styles.summaryValue}>
                {profile.housingOfferedGenerally ? "Generally offered" : "Per listing"}
              </span>
            </li>
            <li className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Meals</span>
              <span className={styles.summaryValue}>
                {profile.mealsOfferedGenerally ? "Generally provided" : "Per listing"}
              </span>
            </li>
          </ul>

          <div className={styles.editorActions}>
            <Link
              href={editHref}
              className={`ui-button ui-button--primary ${styles.editLink}`}
            >
              <Icon name="action.edit" size={20} aria-hidden />
              <span className="ui-button__label">Edit profile</span>
            </Link>
            <Link
              href="/host/listings"
              className={`ui-button ui-button--secondary ${styles.editLink}`}
            >
              <Icon name="action.view" size={20} aria-hidden />
              <span className="ui-button__label">Preview listings</span>
            </Link>
          </div>
        </div>

        <div className={styles.checklistCard}>
          <div className={styles.checklistHead}>
            <div>
              <h3 className={styles.checklistTitle}>Profile checklist</h3>
              <p className={styles.checklistLede}>What makes a host profile convert.</p>
            </div>
            <span className={styles.checklistCount}>
              {completeCount}/{checklist.length}
            </span>
          </div>

          <ul className={styles.checklist}>
            {checklist.map((row) => (
              <li
                key={row.label}
                className={`${styles.checkRow} ${row.done ? styles.checkRowDone : ""}`.trim()}
              >
                <span
                  className={`${styles.checkMark} ${row.done ? styles.checkMarkDone : ""}`.trim()}
                  aria-hidden
                >
                  <Icon
                    name={row.done ? "system.success" : "action.forward"}
                    size={16}
                  />
                </span>
                <span className={styles.checkText}>
                  <span className={styles.checkLabel}>{row.label}</span>
                  <span className={styles.checkHint}>{row.hint}</span>
                </span>
                <span className={styles.checkStatus}>
                  {row.done ? "Done" : "To do"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
