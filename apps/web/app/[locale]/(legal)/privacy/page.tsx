import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Privacy Policy",
		description:
			"What data Explore & Earn collects, how it's used, who processes it, and the rights you have over it.",
	};
}

export default function PrivacyPage() {
	return (
		<>
			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroPrivacy}`}>
				<span className={styles.heroIcon}>
					<Icon name="nav.profile" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Your data,<br />your trust.</h1>
				<p className={styles.heroSub}>
					What we collect, why, and what you can do about it. Operated by Automated Empires.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>We don&rsquo;t sell your data</span>
					<span className={`${styles.badge} ${styles.badgeDate}`}>Updated June 2026</span>
				</div>
			</div>

			{/* No sale callout — prominent */}
			<div className={`${styles.callout} ${styles.calloutGreen}`}>
				<span className={styles.calloutIcon}>
					<Icon name="trust.verified_host" size={16} aria-hidden />
				</span>
				<div className={styles.calloutBody}>
					<p className={styles.calloutTitle}>We don&rsquo;t sell your personal information. We never have.</p>
					<p className={styles.calloutText}>We don&rsquo;t share it with third parties for their own marketing. Full stop.</p>
				</div>
			</div>

			{/* What we collect */}
			<section id="what-we-collect" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.profile" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>What we collect</h2>
				</div>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Account info</strong> — name, email, and login credentials via Clerk (our auth provider).</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Profile &amp; application data</strong> — listings, applications, and profile details you create.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Messages</strong> — conversations you have through the platform.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Usage analytics</strong> — how you use the platform, collected by PostHog (optional, see Cookies).</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Billing info</strong> — host subscription payments handled by Stripe. We never store your card number.</span></li>
				</ul>
				<div className={`${styles.callout} ${styles.calloutSky}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>You must be 18+ to create an account.</p>
						<p className={styles.calloutText}>We do not knowingly collect information from anyone under 18.</p>
					</div>
				</div>
			</section>

			{/* How we use it */}
			<section id="how-we-use-it" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.seek" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>How we use it</h2>
				</div>
				<p className={styles.body}>
					We use your information to run the platform: to create and secure your account, to match seekers with relevant opportunities, to let hosts and seekers communicate, to process host subscription billing, and to improve the product.
				</p>
				<p className={styles.body}>
					We don&rsquo;t use your data to make automated decisions that have legal effects on you.
				</p>
			</section>

			{/* Who processes */}
			<section id="who-processes" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Who processes your data</h2>
				</div>
				<p className={styles.body}>These providers process data under agreements with us, only for the purposes of operating Explore &amp; Earn.</p>
				<div className={styles.providerGrid}>
					<div className={styles.providerCard}>
						<span className={styles.providerName}>Clerk</span>
						<span className={styles.providerRole}>Authentication &amp; identity — stores login credentials.</span>
					</div>
					<div className={styles.providerCard}>
						<span className={styles.providerName}>Supabase</span>
						<span className={styles.providerRole}>Database hosting — stores all application data.</span>
					</div>
					<div className={styles.providerCard}>
						<span className={styles.providerName}>PostHog</span>
						<span className={styles.providerRole}>Product analytics — usage patterns (optional, opt-out anytime).</span>
					</div>
					<div className={styles.providerCard}>
						<span className={styles.providerName}>Stripe</span>
						<span className={styles.providerRole}>Subscription payments — host billing only.</span>
					</div>
				</div>
			</section>

			{/* No sale */}
			<section id="no-sale" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>We don&rsquo;t sell your data</h2>
				</div>
				<p className={styles.body}>
					We don&rsquo;t sell your personal information, and we never have. We don&rsquo;t share it with third parties for their own marketing or advertising purposes.
				</p>
			</section>

			{/* Retention */}
			<section id="retention" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="status.begins" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>How long we keep it</h2>
				</div>
				<p className={styles.body}>We retain your data for as long as your account is active. When you delete your account:</p>
				<div className={styles.retentionRow}>
					<div className={styles.retentionCard}>
						<span className={styles.retentionPeriod}>30 days</span>
						<span className={styles.retentionLabel}>Personal account data removed after deletion</span>
					</div>
					<div className={styles.retentionCard}>
						<span className={styles.retentionPeriod}>7 years</span>
						<span className={styles.retentionLabel}>Billing records kept for legal &amp; tax requirements</span>
					</div>
				</div>
				<p className={styles.body}>Analytics data held by PostHog is governed by PostHog&rsquo;s own retention policies.</p>
			</section>

			{/* Your rights */}
			<section id="your-rights" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Your rights</h2>
				</div>
				<p className={styles.body}>
					You can access, correct, or request deletion of your data at any time. Email us and we&rsquo;ll take care of it.
				</p>
				<div className={styles.pillRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Access your data</span>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Correct it</span>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Delete your account</span>
					<span className={`${styles.badge} ${styles.badgeMuted}`}>EEA: data portability</span>
				</div>
				<p className={styles.body}>
					If you are in the European Economic Area, you also have the right to data portability and to lodge a complaint with your local data protection authority.
				</p>
				<p className={styles.body}>
					You can opt out of analytics at any time using the cookie banner. Choosing &ldquo;Essential only&rdquo; turns off PostHog tracking in your browser.
				</p>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Privacy questions</h2>
				</div>
				<p className={styles.body}>Email us any time with questions, access requests, or deletion requests.</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
