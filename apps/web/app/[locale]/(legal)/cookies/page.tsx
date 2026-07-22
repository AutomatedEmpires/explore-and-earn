import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Cookie Policy",
		description:
			"The cookies Explore & Earn sets — Clerk session, PostHog analytics, and functional — and how to opt out of analytics.",
	};
}

export default function CookiesPage() {
	return (
		<>
			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroCookies}`}>
				<span className={styles.heroIcon}>
					<Icon name="nav.seek" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Cookies: short and honest.</h1>
				<p className={styles.heroSub}>
					We keep it minimal. Here&rsquo;s exactly what we set, why, and for how long.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>No ad tracking</span>
					<span className={`${styles.badge} ${styles.badgeSky}`}>Analytics optional</span>
					<span className={`${styles.badge} ${styles.badgeDate}`}>Updated June 2026</span>
				</div>
			</div>

			{/* What we set */}
			<section id="what-we-set" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.seek" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>What we set</h2>
				</div>

				<div className={styles.cookieList}>
					{/* Clerk cookies */}
					<div className={styles.cookieCard}>
						<div className={styles.cookieRow}>
							<code className={styles.cookieName}>__session</code>
							<div className={styles.pillRow}>
								<span className={`${styles.badge} ${styles.badgeSky}`}>Essential</span>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>Session</span>
							</div>
						</div>
						<p className={styles.cookieDesc}>
							Clerk session token — keeps you securely signed in across pages. Required for the platform to function.
						</p>
					</div>

					<div className={styles.cookieCard}>
						<div className={styles.cookieRow}>
							<code className={styles.cookieName}>__client_uat</code>
							<div className={styles.pillRow}>
								<span className={`${styles.badge} ${styles.badgeSky}`}>Essential</span>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>Session</span>
							</div>
						</div>
						<p className={styles.cookieDesc}>
							Clerk cross-origin user activity token — used when the auth domain differs from the app domain.
						</p>
					</div>

					<div className={styles.cookieCard}>
						<div className={styles.cookieRow}>
							<code className={styles.cookieName}>__clerk_db_jwt</code>
							<div className={styles.pillRow}>
								<span className={`${styles.badge} ${styles.badgeSky}`}>Essential</span>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>Dev only</span>
							</div>
						</div>
						<p className={styles.cookieDesc}>
							Clerk development instance token. Only present in non-production environments.
						</p>
					</div>

					<div className={styles.cookieCard}>
						<div className={styles.cookieRow}>
							<code className={styles.cookieName}>ph_*</code>
							<div className={styles.pillRow}>
								<span className={`${styles.badge} ${styles.badgeGold}`}>Analytics</span>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>1 year</span>
							</div>
						</div>
						<p className={styles.cookieDesc}>
							PostHog analytics — helps us understand how Explore &amp; Earn is used so we can improve it. Not set if you choose &ldquo;Essential only.&rdquo;
						</p>
					</div>

					<div className={styles.cookieCard}>
						<div className={styles.cookieRow}>
							<code className={styles.cookieName}>ph_opt_in_out</code>
							<div className={styles.pillRow}>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>Functional</span>
								<span className={`${styles.badge} ${styles.badgeMuted}`}>1 year</span>
							</div>
						</div>
						<p className={styles.cookieDesc}>
							Stores your analytics consent choice so we don&rsquo;t ask again on every visit.
						</p>
					</div>
				</div>
			</section>

			{/* Essential vs analytics */}
			<section id="essential-vs-analytics" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Essential vs. optional</h2>
				</div>

				<div className={`${styles.callout} ${styles.calloutSky}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Essential cookies can&rsquo;t be turned off.</p>
						<p className={styles.calloutText}>The Clerk session cookies are what keep you signed in. They&rsquo;re required for the platform to work — disabling them means signing out.</p>
					</div>
				</div>

				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="nav.seek" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Analytics cookies are fully optional.</p>
						<p className={styles.calloutText}>PostHog is opt-in. Choose &ldquo;Essential only&rdquo; in the cookie banner to turn it off. Your choice is remembered for a year.</p>
					</div>
				</div>
			</section>

			{/* Opt out */}
			<section id="opt-out" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.close" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Opt out</h2>
				</div>
				<p className={styles.body}>
					You can change your analytics choice at any time:
				</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Use the cookie banner to select &ldquo;Essential only.&rdquo;</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Clear cookies in your browser settings to reset your choice.</span></li>
				</ul>
				<div className={`${styles.callout} ${styles.calloutGreen}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>No advertising or social tracking cookies.</p>
						<p className={styles.calloutText}>We don&rsquo;t load third-party ad or social trackers. Only Clerk and PostHog have cookie access, both configured on our domain.</p>
					</div>
				</div>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Questions?</h2>
				</div>
				<p className={styles.body}>Cookie questions, consent concerns, or anything else — email us.</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
