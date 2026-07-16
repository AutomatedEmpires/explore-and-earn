import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import { DraftBanner } from "../DraftBanner";
import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Terms of Service",
		description:
			"The terms for using Explore & Earn — an opportunity marketplace connecting seekers with hosts who offer housing, meals, and pay.",
	};
}

export default function TermsPage() {
	return (
		<>
			<DraftBanner />

			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroTerms}`}>
				<span className={styles.heroIcon}>
					<Icon name="trust.verified_host" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Terms of Service</h1>
				<p className={styles.heroSub}>The deal between you and us — kept plain.</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Seekers free forever</span>
					<span className={`${styles.badge} ${styles.badgeSky}`}>Cancel anytime</span>
					<span className={`${styles.badge} ${styles.badgeDate}`}>Updated June 2026</span>
				</div>
			</div>

			{/* Key facts callout */}
			<div className={`${styles.callout} ${styles.calloutSky}`}>
				<span className={styles.calloutIcon}>
					<Icon name="benefit.pay" size={16} aria-hidden />
				</span>
				<div className={styles.calloutBody}>
					<p className={styles.calloutTitle}>You must be 18+ to create an account.</p>
					<p className={styles.calloutText}>By using Explore &amp; Earn you agree to these terms. If you don&rsquo;t agree, please don&rsquo;t use the platform.</p>
				</div>
			</div>

			{/* What it is */}
			<section id="what-it-is" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="category.mix" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>What Explore &amp; Earn is</h2>
				</div>
				<p className={styles.body}>
					Explore &amp; Earn is an opportunity marketplace. We connect seekers with hosts who post lifestyle-driven opportunities that may include housing, meals, and pay. We are a marketplace and a point of introduction — not your employer, and not the employer of any host or seeker.
				</p>
				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Any working arrangement is between host and seeker.</p>
						<p className={styles.calloutText}>We are a marketplace — not an employment agency, staffing firm, or party to your arrangement.</p>
					</div>
				</div>
			</section>

			{/* Accounts */}
			<section id="accounts" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.profile" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Accounts &amp; eligibility</h2>
				</div>
				<p className={styles.body}>
					You must provide accurate information and keep it up to date. You are responsible for keeping your login credentials secure and for all activity under your account. One person, one account — unless you operate as a host with team members, in which case your subscription tier determines access.
				</p>
			</section>

			{/* Billing */}
			<section id="billing" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Host subscriptions &amp; billing</h2>
				</div>
				<p className={styles.body}>Hosts access the platform through a paid subscription. Monthly prices:</p>
				<div className={styles.badgeGrid}>
					<div className={`${styles.badgeCard} ${styles.badgeCardGold}`}>
						<Icon name="category.farm" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Starter</span>
						<span className={styles.badgeCardValue}>$199/mo</span>
					</div>
					<div className={`${styles.badgeCard} ${styles.badgeCardSky ?? styles.badgeCardBlue}`}>
						<Icon name="category.remote" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Professional</span>
						<span className={styles.badgeCardValue}>$399/mo</span>
					</div>
					<div className={`${styles.badgeCard} ${styles.badgeCardBlue}`}>
						<Icon name="category.maritime" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Enterprise</span>
						<span className={styles.badgeCardValue}>$749/mo</span>
					</div>
				</div>
				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="status.begins" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Annual plans — 2 months free.</p>
						<p className={styles.calloutText}>Subscriptions renew automatically. Cancel anytime; access continues until the billing period ends. No refunds for unused time unless required by law.</p>
					</div>
				</div>
				<div className={`${styles.callout} ${styles.calloutGreen}`}>
					<span className={styles.calloutIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Seekers are never charged.</p>
						<p className={styles.calloutText}>Not for browsing, not for applying, not ever.</p>
					</div>
				</div>
			</section>

			{/* Conduct */}
			<section id="conduct" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Your conduct</h2>
				</div>
				<p className={styles.body}>Use Explore &amp; Earn honestly and lawfully. You won&rsquo;t:</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Post false, misleading, or unlawful listings or applications.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Harass, threaten, or harm other users.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Misrepresent who you are or what you&rsquo;re offering.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Use the platform to circumvent safety, payment, or verification features.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Scrape, copy, or redistribute platform data without permission.</span></li>
				</ul>
				<p className={styles.body}>Hosts must describe opportunities accurately — including the housing, meals, and pay actually on offer.</p>
			</section>

			{/* Your content */}
			<section id="content" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.more" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Your content</h2>
				</div>
				<p className={styles.body}>
					You keep ownership of the content you submit — your listings, applications, messages, and profile. By posting it, you give us a limited license to host, display, and share that content as needed to run the platform. Everything else — the Explore &amp; Earn name, design, and software — belongs to Automated Empires.
				</p>
			</section>

			{/* Liability */}
			<section id="liability" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="status.ends" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>No guarantees &amp; liability</h2>
				</div>
				<p className={styles.body}>
					We don&rsquo;t guarantee that you&rsquo;ll find an opportunity, be selected, or that any listing is accurately described. You are responsible for your own due diligence before accepting or offering any opportunity.
				</p>
				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>The Verified Host badge is not a background or identity check.</p>
						<p className={styles.calloutText}>
							The badge is granted automatically to hosts on an active paid subscription. It does not mean Automated Empires has independently verified a host&rsquo;s identity, property, or the claims in their listing. Always research a host and confirm the details of any arrangement before you travel.
						</p>
					</div>
				</div>
				<p className={styles.body}>
					To the fullest extent permitted by law, Automated Empires is not liable for any indirect, incidental, or consequential damages arising from your use of the platform. Our total liability is limited to the greater of fees you paid us in the preceding 12 months or $100. These terms are governed by Delaware law.
				</p>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Questions?</h2>
				</div>
				<p className={styles.body}>Email us any time.</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
