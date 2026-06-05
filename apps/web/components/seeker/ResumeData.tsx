import { Chip, Icon } from "@explore-and-earn/ui";
import type { SeekerResume } from "@explore-and-earn/db";

import { SectionHeading } from "./SectionHeading";
import styles from "./ResumeData.module.css";

export interface ResumeDataProps {
	readonly resume: SeekerResume;
}

function formatDateRange(
	start: string | null,
	end: string | null,
	isCurrent = false,
): string {
	const left = start ?? "";
	const right = isCurrent ? "Present" : (end ?? "");
	if (left && right) {
		return `${left} – ${right}`;
	}
	return left || right;
}

/**
 * Live resume detail: experience summaries and certifications read from
 * seeker_resume_experiences / seeker_certifications (migration 004), scoped to
 * the signed-in seeker. Read-only on this pass; complements the founder-locked
 * ResumePanel readiness gauge rendered above it.
 */
export function ResumeData({ resume }: ResumeDataProps) {
	const { experiences, certifications } = resume;

	return (
		<div className={styles.wrap}>
			<section className={styles.block}>
				<SectionHeading
					title="Experience"
					description="Summaries from your work history."
				/>
				{experiences.length === 0 ? (
					<p className={styles.empty}>No experience added yet.</p>
				) : (
					<ul className={styles.list}>
						{experiences.map((experience) => (
							<li key={experience.id} className={styles.item}>
								<div className={styles.itemHead}>
									<span className={styles.itemTitle}>
										{experience.roleTitle ?? "Role"}
										{experience.companyName
											? ` · ${experience.companyName}`
											: ""}
									</span>
									<span className={styles.itemMeta}>
										{formatDateRange(
											experience.startDate,
										experience.endDate,
										experience.isCurrent,
									)}
									</span>
								</div>
								{experience.summary ? (
									<p className={styles.itemSummary}>{experience.summary}</p>
								) : null}
								{experience.skillTags.length > 0 ? (
									<ul className={styles.tags}>
										{experience.skillTags.map((tag) => (
											<li key={tag}>
												<Chip>{tag}</Chip>
											</li>
										))}
									</ul>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>

			<section className={styles.block}>
				<SectionHeading
					title="Certifications"
					description="Credentials that boost match confidence."
				/>
				{certifications.length === 0 ? (
					<p className={styles.empty}>No certifications added yet.</p>
				) : (
					<ul className={styles.list}>
						{certifications.map((certification) => (
							<li key={certification.id} className={styles.item}>
								<div className={styles.itemHead}>
									<span className={styles.itemTitle}>
										<Icon name="trust.verified_host" size={16} aria-hidden />{" "}
										{certification.name}
									</span>
									<span className={styles.itemMeta}>
										{formatDateRange(
											certification.issuedAt,
										certification.expiresAt,
									)}
									</span>
								</div>
								{certification.issuingOrganization ? (
									<p className={styles.itemSummary}>
										{certification.issuingOrganization}
									</p>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
