import type { SeekerResume } from "@explore-and-earn/db";
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./SeekerResumeCard.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<MarketplaceCategory, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

const SEEKING_LABEL: Record<string, string> = {
  now: "Available now",
  "1_month": "In 1 month",
  "3_months": "In 3 months",
  "6_months": "In 6 months",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCategory(value: string): value is MarketplaceCategory {
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value);
}

function safeExternalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 7 ? `${iso}-01` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function dateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): string {
  const s = formatDate(start);
  const e = isCurrent ? "Present" : formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkillChip({ label }: { label: string }) {
  return <span className={styles.skillChip}>{label}</span>;
}

function CategoryChip({ cat }: { cat: string }) {
  if (!isCategory(cat)) return null;
  return (
    <span className={`${styles.categoryChip} ${styles[`cat_${cat}`]}`}>
      <Icon name={CATEGORY_ICON[cat]} size={16} aria-hidden />
      {CATEGORY_LABEL[cat]}
    </span>
  );
}

function SectionDivider({ label, icon }: { label: string; icon: IconKey }) {
  return (
    <div className={styles.divider}>
      <Icon name={icon} size={16} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface SeekerResumeCardProps {
  readonly resume: SeekerResume;
  /** Override display name (e.g. from host view when name is known separately) */
  readonly displayNameOverride?: string | null;
}

export function SeekerResumeCard({
  resume,
  displayNameOverride,
}: SeekerResumeCardProps) {
  const profile = resume.profile;
  const displayName =
    displayNameOverride ?? profile?.displayName ?? "Seeker";
  const location = profile?.location ?? null;
  const seekingTimeline = profile?.seekingTimeline ?? null;
  const bio = profile?.bio ?? null;
  const desiredCategories = profile?.desiredCategories ?? [];
  const generalSkills = profile?.generalSkills ?? [];

  const hasExperiences = resume.experiences.length > 0;
  const hasEducations = resume.educations.length > 0;
  const hasCerts = resume.certifications.length > 0;
  const hasSkills = generalSkills.length > 0;

  const allSkillTags = Array.from(
    new Set(
      resume.experiences
        .flatMap((e) => e.skillTags)
        .concat(resume.educations.flatMap((e) => e.skillTags))
        .concat(resume.certifications.flatMap((c) => c.skillTags))
        .concat(generalSkills),
    ),
  ).filter((s) => s.trim().length > 0);

  return (
    <article className={styles.card}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden>
          <Icon name="nav.profile" size={24} aria-hidden />
        </div>
        <div className={styles.headerInfo}>
          <h2 className={styles.name}>{displayName}</h2>
          <div className={styles.headerMeta}>
            {location && (
              <span className={styles.metaItem}>
                <Icon name="mappin.remote" size={16} aria-hidden />
                {location}
              </span>
            )}
            {seekingTimeline && (
              <span className={styles.seekingBadge}>
                <Icon name="status.open" size={16} aria-hidden />
                {SEEKING_LABEL[seekingTimeline] ?? seekingTimeline}
              </span>
            )}
          </div>
          {desiredCategories.length > 0 && (
            <div className={styles.categoryRow}>
              {desiredCategories.filter(isCategory).map((cat) => (
                <CategoryChip key={cat} cat={cat} />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Bio */}
      {bio && (
        <section className={styles.section} aria-label="Bio">
          <blockquote className={styles.bio}>{bio}</blockquote>
        </section>
      )}

      {/* Experience */}
      {hasExperiences && (
        <section className={styles.section} aria-label="Experience">
          <SectionDivider label="Experience" icon="analytics.trend" />
          <div className={styles.entryList}>
            {resume.experiences.map((exp) => (
              <div key={exp.id} className={styles.entry}>
                <div className={styles.entryHead}>
                  <div className={styles.entryTitle}>
                    {exp.roleTitle && (
                      <span className={styles.entryRole}>{exp.roleTitle}</span>
                    )}
                    {exp.companyName && (
                      <span className={styles.entryOrg}>{exp.companyName}</span>
                    )}
                  </div>
                  <div className={styles.entryMeta}>
                    {exp.location && (
                      <span className={styles.metaItem}>
                        <Icon name="mappin.remote" size={16} aria-hidden />
                        {exp.location}
                      </span>
                    )}
                    <span className={styles.metaItem}>
                      {dateRange(exp.startDate, exp.endDate, exp.isCurrent)}
                    </span>
                  </div>
                </div>
                {exp.categoryTags.filter(isCategory).map((cat) => (
                  <CategoryChip key={cat} cat={cat} />
                ))}
                {exp.summary && (
                  <p className={styles.entrySummary}>{exp.summary}</p>
                )}
                {exp.skillTags.length > 0 && (
                  <div className={styles.chipRow}>
                    {exp.skillTags.map((t) => (
                      <SkillChip key={t} label={t} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {hasEducations && (
        <section className={styles.section} aria-label="Education">
          <SectionDivider label="Education" icon="system.info" />
          <div className={styles.entryList}>
            {resume.educations.map((edu) => (
              <div key={edu.id} className={styles.entry}>
                <div className={styles.entryHead}>
                  <div className={styles.entryTitle}>
                    {edu.programOrDegree && (
                      <span className={styles.entryRole}>{edu.programOrDegree}</span>
                    )}
                    {edu.institution && (
                      <span className={styles.entryOrg}>{edu.institution}</span>
                    )}
                  </div>
                  <div className={styles.entryMeta}>
                    {edu.location && (
                      <span className={styles.metaItem}>
                        <Icon name="mappin.remote" size={16} aria-hidden />
                        {edu.location}
                      </span>
                    )}
                    <span className={styles.metaItem}>
                      {dateRange(edu.startDate, edu.endDate, edu.isCurrent)}
                    </span>
                  </div>
                </div>
                {edu.description && (
                  <p className={styles.entrySummary}>{edu.description}</p>
                )}
                {edu.skillTags.length > 0 && (
                  <div className={styles.chipRow}>
                    {edu.skillTags.map((t) => (
                      <SkillChip key={t} label={t} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {hasCerts && (
        <section className={styles.section} aria-label="Certifications">
          <SectionDivider label="Certifications" icon="status.match" />
          <div className={styles.certList}>
            {resume.certifications.map((cert) => (
              <div key={cert.id} className={styles.certEntry}>
                <div className={styles.certHead}>
                  <span className={styles.certName}>{cert.name}</span>
                  <div className={styles.certMeta}>
                    {cert.issuingOrganization && (
                      <span>{cert.issuingOrganization}</span>
                    )}
                    {cert.issuedAt && (
                      <span>{formatDate(cert.issuedAt)}</span>
                    )}
                    {cert.doesNotExpire ? (
                      <span className={styles.certNoExpiry}>No expiry</span>
                    ) : cert.expiresAt ? (
                      <span className={styles.certExpiry}>
                        Expires {formatDate(cert.expiresAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {cert.description && (
                  <p className={styles.entrySummary}>{cert.description}</p>
                )}
                {cert.skillTags.length > 0 && (
                  <div className={styles.chipRow}>
                    {cert.skillTags.map((t) => (
                      <SkillChip key={t} label={t} />
                    ))}
                  </div>
                )}
                {cert.credentialUrl && (() => {
                  const safeHref = safeExternalUrl(cert.credentialUrl);
                  return safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.credLink}
                    >
                      View credential
                      <Icon name="action.forward" size={16} aria-hidden />
                    </a>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills cloud */}
      {(hasSkills || allSkillTags.length > 0) && (
        <section className={styles.section} aria-label="Skills">
          <SectionDivider label="Skills" icon="nav.profile" />
          <div className={styles.skillCloud}>
            {allSkillTags.map((s) => (
              <SkillChip key={s} label={s} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!bio &&
        !hasExperiences &&
        !hasEducations &&
        !hasCerts &&
        !hasSkills && (
          <div className={styles.emptyState}>
            <Icon name="nav.profile" size={24} aria-hidden />
            <p>Resume not yet completed.</p>
          </div>
        )}
    </article>
  );
}
