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

export function ResumePanel({ progress }: ResumePanelProps) {
	const gateMessage = progress.canApply
		? `You can apply now. Reach ${progress.recommendedThreshold}% for stronger match confidence.`
		: `Reach ${progress.applyThreshold}% to unlock applying.`;

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
							<Icon name={STATUS_ICON[section.status]} size={18} aria-hidden />
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
