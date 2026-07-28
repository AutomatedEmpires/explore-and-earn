import Link from "next/link";
import { Badge, Icon } from "@explore-and-earn/ui";
import { topMatchReasons } from "@explore-and-earn/contracts";
import type { SeekerProfileForHost, SeekerResume } from "@explore-and-earn/db";

import { CATEGORY_LABEL, toDiscoveryCardData } from "../discovery";
import { SeekerResumeCard } from "../seeker/SeekerResumeCard";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type HostApplicantItem,
} from "./models";
import styles from "./HostApplicantDetail.module.css";

export interface HostApplicantDetailProps {
  readonly applicant: HostApplicantItem;
  /**
   * The applicant's resume when the signed-in host is allowed to see it.
   * `null` renders the "not completed yet" empty state; `undefined` hides the
   * resume section entirely (for surfaces that do not load a resume).
   */
  readonly resume?: SeekerResume | null;
  /**
   * The entitled profile projection from the migration-084 bridge: location,
   * timeline, desired roles, housing need. `null` means the read returned no
   * row, which is "not entitled, or nothing recorded" — never invented.
   */
  readonly profile?: SeekerProfileForHost | null;
  /** Rendered into the sticky rail on desktop — the stage-move controls. */
  readonly actions?: React.ReactNode;
  /** Show the match reading (ADR-039 'full' analytics scope). */
  readonly showMatch?: boolean;
}

/** seeker_profiles.seeking_timeline (migration 032) → a host-readable phrase. */
const TIMELINE_LABEL: Record<string, string> = {
  now: "Ready now",
  "1_month": "Within a month",
  "3_months": "Within three months",
  "6_months": "Within six months",
};

/** seeker_profiles.housing_preference → what the host must actually provide. */
const HOUSING_LABEL: Record<string, string> = {
  required: "Needs housing",
  preferred: "Prefers housing",
  not_needed: "Does not need housing",
  flexible: "Flexible on housing",
};

/** seeker_profiles.location_pref → where they will work. */
const LOCATION_PREF_LABEL: Record<string, string> = {
  remote: "Remote only",
  on_site: "On site",
  either: "On site or remote",
};

function labelled(map: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return map[value] ?? value;
}

/**
 * The candidate detail view.
 *
 * WHAT IT CAN SHOW, AND WHY THAT IS THE LIST. Everything about the person comes
 * through the migration-084 applicant bridge, which returns exactly the fields a
 * host is entitled to once a real relationship exists. That set is the reason
 * some of the founder's wish-list is here and some is not:
 *
 *   HERE     — name, location, work-location preference, availability timeline,
 *              desired roles, skills, housing need, experience, education,
 *              certifications, their message, the listing, the message thread.
 *   NOT HERE — private host notes (host_seeker_dispositions.note exists in the
 *              schema and has no read or write path anywhere in the codebase),
 *              stage history (applications.reviewed_at and decided_at are never
 *              written, and no status-history table exists), and uploaded
 *              documents (there is no resume file store — the resume is
 *              structured rows).
 *
 * Each of those three is absent rather than stubbed. A "Notes" box that saves
 * nowhere, or a timeline drawn from columns nothing writes, would be the exact
 * class of promise this redesign exists to stop making.
 */
export function HostApplicantDetail({
  applicant,
  resume,
  profile,
  actions,
  showMatch = false,
}: HostApplicantDetailProps) {
  const { listing, stage } = applicant;
  const declined = stage === "declined";
  const roundedScore =
    applicant.matchScore != null ? Math.round(applicant.matchScore) : null;
  const reasons = applicant.matchComponents
    ? topMatchReasons(applicant.matchComponents, 3)
    : [];

  const facts: readonly { readonly label: string; readonly value: string }[] = [
    { label: "Applied", value: applicant.appliedOn },
    ...(profile?.relativeLocation
      ? [{ label: "Based", value: profile.relativeLocation }]
      : []),
    ...(labelled(LOCATION_PREF_LABEL, profile?.locationPref ?? null)
      ? [{ label: "Works", value: labelled(LOCATION_PREF_LABEL, profile!.locationPref)! }]
      : []),
    ...(labelled(TIMELINE_LABEL, profile?.seekingTimeline ?? null)
      ? [
          {
            label: "Available",
            value: labelled(TIMELINE_LABEL, profile!.seekingTimeline)!,
          },
        ]
      : []),
    ...(labelled(HOUSING_LABEL, profile?.housingPreference ?? null)
      ? [{ label: "Housing", value: labelled(HOUSING_LABEL, profile!.housingPreference)! }]
      : []),
  ];

  const certifications = resume?.certifications ?? [];

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <header className={styles.head}>
          <div className={styles.titleGroup}>
            {/* The candidate's NAME is the page h1 immediately above this card,
                so repeating it here would give a screen reader the same string
                twice and tell a sighted reader nothing new. This heading names
                what the card is about instead: the application itself. */}
            <h2 className={styles.title}>Applied to {listing.title}</h2>
            <p className={styles.meta}>
              {applicant.appliedOn}
              {applicant.reapplied ? " · re-applied after withdrawing" : ""}
            </p>
          </div>
          <Badge
            label={APPLICANT_STAGE_LABEL[stage]}
            icon={APPLICANT_STAGE_ICON[stage]}
          />
        </header>

        {facts.length > 0 ? (
          <dl className={styles.facts}>
            {facts.map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {showMatch && roundedScore !== null ? (
          <section className={styles.section} aria-labelledby="match-heading">
            <h3 id="match-heading" className={styles.sectionTitle}>
              Why this match
            </h3>
            {reasons.length > 0 ? (
              <ul className={styles.reasons}>
                {reasons.map((reason) => (
                  <li key={reason.component} className={styles.reason}>
                    <Icon name="status.match" size={16} aria-hidden />
                    <span className={styles.reasonLabel}>{reason.label}</span>
                    <span className={styles.reasonNote}>
                      one of the strongest contributors to this score
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              // The score is stored but its components are not. There is nothing
              // truthful to say about WHY, so nothing is said.
              <p className={styles.hint}>
                No component breakdown was recorded for this match, so there is
                nothing to explain the score with.
              </p>
            )}
            <p className={styles.matchFoot}>
              Overall fit <b className="ui-tabular">{roundedScore}/100</b> — a
              discovery aid computed from their profile, never a hiring decision.
            </p>
          </section>
        ) : null}

        {applicant.note ? (
          <section className={styles.section} aria-labelledby="message-heading">
            <h3 id="message-heading" className={styles.sectionTitle}>
              Their application message
            </h3>
            {/* applications.cover_message is the ONLY free text an applicant
                writes — there is no structured questionnaire in the schema, so
                there are no other "answers" to show. */}
            <p className={styles.coverMessage}>{applicant.note}</p>
          </section>
        ) : null}

        {profile && profile.desiredRoles.length > 0 ? (
          <section className={styles.section} aria-labelledby="roles-heading">
            <h3 id="roles-heading" className={styles.sectionTitle}>
              Roles they are looking for
            </h3>
            <ul className={styles.tags}>
              {profile.desiredRoles.map((role) => (
                <li key={role} className={styles.tag}>
                  {role}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {certifications.length > 0 ? (
          <section className={styles.section} aria-labelledby="certs-heading">
            <h3 id="certs-heading" className={styles.sectionTitle}>
              Certifications
            </h3>
            <ul className={styles.certs}>
              {certifications.map((cert) => (
                <li key={cert.id} className={styles.cert}>
                  <span className={styles.certName}>{cert.name}</span>
                  {cert.issuingOrganization ? (
                    <span className={styles.certOrg}>{cert.issuingOrganization}</span>
                  ) : null}
                  {cert.doesNotExpire ? (
                    <span className={styles.certMeta}>Does not expire</span>
                  ) : cert.expiresAt ? (
                    <span className={styles.certMeta}>Expires {cert.expiresAt}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {resume !== undefined ? (
          <section className={styles.section} aria-label="Applicant resume">
            <h3 className={styles.sectionTitle}>Experience</h3>
            {resume != null ? (
              <SeekerResumeCard
                resume={resume}
                displayNameOverride={applicant.applicantName}
              />
            ) : (
              <p className={styles.hint}>
                This seeker has not filled in their resume yet.
              </p>
            )}
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="listing-heading">
          <h3 id="listing-heading" className={styles.sectionTitle}>
            Applied to
          </h3>
          <p className={styles.hint}>
            {CATEGORY_LABEL[listing.category]} · {listing.location}
          </p>
          <Link className={styles.listingLink} href={`/host/listings/${listing.id}`}>
            {toDiscoveryCardData(listing).title}
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </section>

        {declined ? (
          <p className={styles.declined}>
            <Icon name="action.close" size={16} aria-hidden />
            This candidacy is closed — passed on, withdrawn, or expired.
          </p>
        ) : null}
      </div>

      {/* Sticky on desktop so the decision is always reachable, however long the
          resume runs; a normal block on mobile, where a fixed rail would eat the
          screen the resume needs. */}
      <aside className={styles.rail} aria-label="Applicant actions">
        <div className={styles.railInner}>
          {actions}
          {applicant.threadId ? (
            <Link
              className={styles.railMessage}
              href={`/host/messages/${applicant.threadId}`}
            >
              <Icon name="action.message" size={18} aria-hidden />
              Open message thread
            </Link>
          ) : null}
          <Link className={styles.railBack} href="/host/applicants">
            <Icon name="action.back" size={16} aria-hidden />
            All applicants
          </Link>
        </div>
      </aside>
    </div>
  );
}
