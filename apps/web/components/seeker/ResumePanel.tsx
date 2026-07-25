import { Icon, Meter } from "@explore-and-earn/ui";
import type { ResumeProgress, ResumeSectionStatus } from "./resume";
import styles from "./ResumePanel.module.css";

const STATUS_ICON: Record<
	ResumeSectionStatus,
	"system.success" | "system.warning" | "system.info"
> = {
	complete: "system.success",
	incomplete: "system.warning",
	optional: "system.info",
};

const STATUS_LABEL: Record<ResumeSectionStatus, string> = {
	complete: "Complete",
	incomplete: "Needs info",
	optional: "Optional",
};

export interface ResumePanelProps {
	readonly progress: ResumeProgress;
}

/** Seeker-facing names for the gate's section identifiers. */
const MISSING_LABEL: Record<string, string> = {
	displayName: "your name",
	location: "where you're based",
	seekingTimeline: "when you're available",
	skills: "at least one skill",
	bioOrExperience: "a bio or one experience",
};

/** "a, b and c" — a list a person would actually read aloud. */
function humanList(items: readonly string[]): string {
	if (items.length <= 1) return items[0] ?? "";
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function ResumePanel({ progress }: ResumePanelProps) {
	// This used to say "Reach 70% to unlock applying" — a rule that does not
	// exist. Applying is gated on a SET of required sections, so a seeker at 80%
	// could be blocked and a seeker at 40% could already apply. Name what is
	// actually outstanding instead of quoting a threshold.
	const outstanding = (progress.missing ?? [])
		.map((section) => MISSING_LABEL[section] ?? section)
		.filter(Boolean);

	const gateMessage = progress.canApply
		? "Your résumé has everything hosts need — you can apply to any listing."
		: outstanding.length > 0
			? `Add ${humanList(outstanding)} to start applying.`
			: "Finish the required sections below to start applying.";

	return (
		<div className={styles.panel}>
			<section className={styles.progress}>
				<Meter value={progress.completion} label="Resume completion" />
				<p className={styles.gate}>{gateMessage}</p>
			</section>

			<ul className={styles.sections}>
				{progress.sections.map((section) => (
					<li key={section.id} className={styles.section}>
						<span className={styles.icon}>
							<Icon name={STATUS_ICON[section.status]} size={20} aria-hidden />
						</span>
						<span className={styles.text}>
							<span className={styles.title}>
								{section.title}
								{section.required ? (
									<span className={styles.required}> · Required</span>
								) : null}
							</span>
							<span className={styles.detail}>{section.detail}</span>
						</span>
						<span className={styles.status}>{STATUS_LABEL[section.status]}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
