import type { ReactNode } from "react";
import { Badge, Icon } from "@explore-and-earn/ui";
import {
  MATCH_BANDS,
  matchBandFor,
  type MatchBand,
} from "@explore-and-earn/contracts";

import { CATEGORY_ICON, CATEGORY_LABEL } from "../discovery";
import styles from "./SourcedSeekerCard.module.css";

/**
 * Discovery-safe seeker projection surfaced by the host "Matched seekers"
 * bucket (packages/db getMatchedSeekersForListing → SourcedSeeker). Declared
 * locally so this client component never imports the server-only db package;
 * the shape is structurally identical to the server type, so the server object
 * flows straight through.
 */
export interface SourcedSeekerVM {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly shortBio: string | null;
  /** Intentionally null until seeker-uploaded profile media has a trusted URL policy. */
  readonly photoUrl: null;
  readonly generalSkills: readonly string[];
  readonly desiredCategories: readonly string[];
  readonly score: number;
  readonly band: MatchBand;
  readonly alreadyInvited: boolean;
}

export interface SourcedSeekerCardProps {
  readonly seeker: SourcedSeekerVM;
  /** Invite control (or blocked upsell / already-invited state) from the parent. */
  readonly action: ReactNode;
}

const MAX_SKILLS = 5;

/** Canonical band label (issue #46) for a real ADR-040 match score. */
function bandLabel(band: MatchBand | undefined, score: number): string {
  const id = band ?? matchBandFor(score);
  return MATCH_BANDS.find((entry) => entry.id === id)?.label ?? "Match";
}

/** Initials monogram fallback when the seeker has no profile photo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function isCategoryKey(value: string): value is keyof typeof CATEGORY_LABEL {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, value);
}

/**
 * A sourced seeker rendered on the host_applicant_review visual language — the
 * same monogram + real-score match chip treatment as HostApplicantCard, but for
 * the discovery-safe seeker projection (name, short bio, skills, desired
 * categories) shown BEFORE any application. No availability, pay, contact, or
 * resume data is exposed here (that unlocks only through an application or
 * conversation — enforced server-side). The match score is the persisted
 * ADR-040 aggregate value, never a fabricated signal. Sensitive component
 * telemetry (including pay and availability alignment) never crosses the
 * pre-application discovery boundary.
 */
export function SourcedSeekerCard({ seeker, action }: SourcedSeekerCardProps) {
  const roundedScore = Math.round(seeker.score);
  const name = seeker.displayName ?? "Seeker";
  const skills = seeker.generalSkills.slice(0, MAX_SKILLS);
  const extraSkills = seeker.generalSkills.length - skills.length;
  const categories = seeker.desiredCategories.filter(isCategoryKey);

  return (
    <article className={styles.card} aria-label={`${name} seeker profile`}>
      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden>
            {initials(name)}
          </span>
          <div className={styles.whoText}>
            <span className={styles.name}>{name}</span>
            {categories.length > 0 ? (
              <div className={styles.cats}>
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    label={CATEGORY_LABEL[cat]}
                    icon={CATEGORY_ICON[cat]}
                    variant="neutral"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={styles.match}
          aria-label={`Match ${roundedScore} out of 100 — ${bandLabel(seeker.band, roundedScore)}`}
        >
          <Icon name="status.match" size={16} aria-hidden />
          <span className={styles.matchLabel}>{bandLabel(seeker.band, roundedScore)}</span>
          <span className={styles.matchScore}>
            {roundedScore}
            <span className={styles.matchScoreUnit}>/100</span>
          </span>
        </div>
      </div>

      {seeker.shortBio ? <p className={styles.bio}>{seeker.shortBio}</p> : null}

      {skills.length > 0 ? (
        <ul className={styles.skills} aria-label="Skills">
          {skills.map((skill) => (
            <li key={skill} className={styles.skill}>
              {skill}
            </li>
          ))}
          {extraSkills > 0 ? (
            <li className={`${styles.skill} ${styles.skillMore}`}>+{extraSkills} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className={styles.actionRow}>{action}</div>
    </article>
  );
}
