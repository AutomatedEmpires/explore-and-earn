import Link from "next/link";

import { Icon, Meter, type IconKey } from "@explore-and-earn/ui";

import { SectionHeading } from "./SectionHeading";
import { StatusStrip } from "./StatusStrip";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./ProfileHub.module.css";

export interface ProfileHubProps {
	readonly status: SeekerStatusSummary;
}

interface ProfileLink {
	readonly href: string;
	readonly icon: IconKey;
	readonly label: string;
	readonly detail: string;
}

/**
 * Unified seeker profile hub. Composes existing lane pieces (StatusStrip, the
 * Meter primitive, SectionHeading) and links out to every seeker surface, so
 * the founder-locked Profile tab is a real home base instead of a dead end.
 * UI-only (Sprint Zero) — reads the SEEKER_STATUS fixture; no backend.
 */
const PROFILE_LINKS: readonly ProfileLink[] = [
	{ href: "/resume", icon: "nav.profile", label: "Resume", detail: "Edit your tag-based compatibility profile." },
	{ href: "/saved", icon: "nav.saved", label: "Saved", detail: "Opportunities you have bookmarked." },
	{ href: "/applied", icon: "action.apply", label: "Applications", detail: "Track every application status." },
	{ href: "/offered", icon: "status.match", label: "Offers", detail: "Review offers sent by hosts." },
	{ href: "/invites", icon: "status.boosted", label: "Invites", detail: "Host invitations to apply." },
	{ href: "/journey", icon: "analytics.trend", label: "Journey", detail: "Your adventure timeline." },
	{ href: "/messages", icon: "nav.messages", label: "Messages", detail: "Conversations with hosts." },
	{ href: "/notifications", icon: "action.message", label: "Notifications", detail: "Updates, reminders, and check-ins." },
	{ href: "/travel", icon: "mappin.cluster", label: "Travel", detail: "Plan travel for accepted roles." },
	{ href: "/schedule", icon: "category.seasonal", label: "Schedule", detail: "Upcoming shifts and check-ins." },
	{ href: "/settings", icon: "system.lock", label: "Settings", detail: "Account, privacy, and preferences." },
	{ href: "/help", icon: "system.info", label: "Help", detail: "Guides and support." },
];

export function ProfileHub({ status }: ProfileHubProps) {
	const initial = status.seekerName.trim().charAt(0).toUpperCase() || "S";
	const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
	const badgeClass = resumeReady
		? styles.badge
		: `${styles.badge} ${styles.badgePriority}`;
	const badgeLabel = resumeReady
		? "Ready to apply"
		: `Resume ${status.resumeCompletion}%`;
	const resumeNote = resumeReady
		? "Your resume is ready — you can apply to any opportunity."
		: `Reach ${RESUME_APPLY_THRESHOLD}% to unlock applications.`;

	return (
		<div className={styles.hub}>
			<header className={styles.identity}>
				<span className={styles.avatar} aria-hidden>
					{initial}
				</span>
				<div className={styles.identityText}>
					<h2 className={styles.name}>{status.seekerName}</h2>
					<p className={styles.identityMeta}>Seeker scope</p>
				</div>
				<span className={badgeClass}>{badgeLabel}</span>
			</header>

			<StatusStrip status={status} />

			<section className={styles.section}>
				<SectionHeading
					title="Resume"
					description="Your visual, tag-based compatibility profile."
					actionLabel="Manage"
					actionHref="/resume"
				/>
				<div className={styles.resumeCard}>
					<Meter value={status.resumeCompletion} label="Resume completion" />
					<p className={styles.resumeNote}>{resumeNote}</p>
				</div>
			</section>

			<section className={styles.section}>
				<SectionHeading
					title="Manage"
					description="Jump to any part of your seeker experience."
				/>
				<ul className={styles.grid}>
					{PROFILE_LINKS.map((link) => (
						<li key={link.href}>
							<Link className={styles.tile} href={link.href}>
								<span className={styles.tileIcon} aria-hidden>
									<Icon name={link.icon} size={20} aria-hidden />
								</span>
								<span className={styles.tileText}>
									<span className={styles.tileLabel}>{link.label}</span>
									<span className={styles.tileDetail}>{link.detail}</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
