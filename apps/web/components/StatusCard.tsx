"use client";

import { AppIllustration, Icon, type IconKey } from "@explore-and-earn/ui";
import Link from "next/link";
import { useId } from "react";

import styles from "./StatusCard.module.css";

export type StatusScope = "public" | "seeker" | "host" | "admin";
export type StatusPresentation = "standalone" | "embedded";

export interface RecoveryLink {
	readonly href: string;
	readonly label: string;
	readonly icon?: IconKey;
}

interface StatusCardProps {
	readonly type: "404" | "error";
	readonly digest?: string;
	readonly onReset?: () => void;
	readonly scope?: StatusScope;
	readonly presentation?: StatusPresentation;
	readonly eyebrow?: string;
	readonly title?: string;
	readonly message?: string;
	readonly destination?: RecoveryLink;
	readonly secondaryDestination?: RecoveryLink | null;
}

const DESTINATIONS: Record<StatusScope, RecoveryLink> = {
	public: { href: "/search", label: "Browse opportunities", icon: "nav.seek" },
	seeker: { href: "/seek", label: "Keep exploring", icon: "nav.seek" },
	host: { href: "/host/listings", label: "View your listings", icon: "nav.dashboard" },
	admin: { href: "/admin", label: "Return to admin", icon: "nav.admin" },
};

const SECONDARY_DESTINATIONS: Record<StatusScope, RecoveryLink | null> = {
	public: { href: "/", label: "Go home", icon: "nav.dashboard" },
	seeker: { href: "/profile", label: "View profile", icon: "nav.profile" },
	host: { href: "/host", label: "Host home", icon: "nav.dashboard" },
	admin: null,
};

/**
 * Shared recovery surface for route-level not-found and error boundaries.
 *
 * The component stays translation-free because the root not-found boundary can
 * render before the locale provider. Workspace boundaries opt into `embedded`
 * so their shell — not this panel — continues to own the viewport.
 */
export function StatusCard({
	type,
	digest,
	onReset,
	scope = "public",
	presentation = "standalone",
	eyebrow,
	title,
	message,
	destination,
	secondaryDestination,
}: StatusCardProps) {
	const isError = type === "error";
	const headingId = useId();
	const messageId = useId();
	const primary = destination ?? DESTINATIONS[scope];
	const secondary = isError && onReset
		? (secondaryDestination === undefined ? primary : secondaryDestination)
		: (secondaryDestination === undefined
			? SECONDARY_DESTINATIONS[scope]
			: secondaryDestination);

	return (
		<section
			className={styles.page}
			data-status-card
			data-presentation={presentation}
			data-scope={scope}
			aria-labelledby={headingId}
			aria-describedby={messageId}
		>
			<div className={styles.surface} data-status-surface>
				<div className={styles.illustration} aria-hidden>
					<AppIllustration
						name={isError ? "error.generic" : "error.notFound"}
						size={presentation === "embedded" ? "sm" : "md"}
					/>
				</div>

				<div className={styles.content}>
					<Link className={styles.brand} href="/" aria-label="Explore & Earn home">
						Explore<span aria-hidden>&amp;</span>Earn
					</Link>
					<div
						className={styles.announcement}
						role={isError ? "alert" : undefined}
						aria-labelledby={isError ? headingId : undefined}
						aria-describedby={isError ? messageId : undefined}
					>
						<p className={styles.eyebrow}>
							{eyebrow ?? (isError ? "Something went wrong" : "Page not found")}
						</p>
						<h1 className={styles.heading} id={headingId}>
							{title ?? (isError ? "We couldn’t load this page." : "This page isn’t available.")}
						</h1>
						<p className={styles.message} id={messageId}>
							{message ?? (isError
								? (digest
									? "Try again. If the problem continues, use the incident ID when you contact support."
									: "Try again. If the problem continues, contact support.")
								: "The link may be out of date, or the page may have moved. Use the links below to continue.")}
						</p>
					</div>

					{digest ? (
						<p className={styles.digest} aria-live="polite">
							<span>Incident ID</span>
							<code>{digest}</code>
						</p>
					) : null}

					<div className={styles.actions}>
						{isError && onReset ? (
							<button className={styles.primary} type="button" onClick={onReset}>
								Try again
							</button>
						) : (
							<Link className={styles.primary} href={primary.href}>
								{primary.icon ? <Icon name={primary.icon} size={16} aria-hidden /> : null}
								{primary.label}
							</Link>
						)}

						{secondary ? (
							<Link className={styles.secondary} href={secondary.href}>
								{secondary.icon ? <Icon name={secondary.icon} size={16} aria-hidden /> : null}
								{secondary.label}
							</Link>
						) : null}
					</div>
				</div>
			</div>
		</section>
	);
}
