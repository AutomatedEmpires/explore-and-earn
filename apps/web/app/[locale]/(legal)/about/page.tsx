import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "About",
		description:
			"Explore & Earn is a discovery marketplace built by seekers, for seekers — putting housing, meals, and pay on every listing, always.",
	};
}

export default function AboutPage() {
	return (
		<>
			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroAbout}`}>
				<span className={styles.heroIcon}>
					<Icon name="category.mix" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Built by seekers,<br />for seekers.</h1>
				<p className={styles.heroSub}>
					A marketplace for lifestyle work that puts housing, meals, and pay on every listing — before you ever have to ask.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGold}`}>Pre-launch</span>
					<span className={`${styles.badge} ${styles.badgeMuted}`}>by Automated Empires</span>
				</div>
			</div>

			{/* Mission */}
			<section id="mission" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="category.mix" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>The marketplace</h2>
				</div>
				<p className={styles.body}>
					Explore &amp; Earn connects people who want to work in places worth waking up in with hosts who need reliable, motivated people. We are an opportunity marketplace — not a job board, not a staffing agency.
				</p>
				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Seekers pay nothing. Ever.</p>
						<p className={styles.calloutText}>Browse, swipe, save, and apply — always free. Hosts fund the marketplace through subscriptions.</p>
					</div>
				</div>
			</section>

			{/* The three questions */}
			<section id="three-questions" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="benefit.housing" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>The three questions</h2>
				</div>
				<p className={styles.body}>Every listing on Explore &amp; Earn answers these before you click in — no digging, no guesswork.</p>
				<div className={styles.badgeGrid}>
					<div className={`${styles.badgeCard} ${styles.badgeCardGreen}`}>
						<Icon name="benefit.housing" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Housing</span>
						<span className={styles.badgeCardValue}>Where will I sleep?</span>
					</div>
					<div className={`${styles.badgeCard} ${styles.badgeCardGreen}`}>
						<Icon name="benefit.meals" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Meals</span>
						<span className={styles.badgeCardValue}>What will I eat?</span>
					</div>
					<div className={`${styles.badgeCard} ${styles.badgeCardBlue}`}>
						<Icon name="benefit.pay" size={20} aria-hidden />
						<span className={styles.badgeCardLabel}>Pay</span>
						<span className={styles.badgeCardValue}>What will I earn?</span>
					</div>
				</div>
				<p className={styles.body}>
					If a host can&rsquo;t answer those three, the listing isn&rsquo;t ready to go live. That&rsquo;s not a rule for its own sake — it&rsquo;s the minimum a seeker needs to say yes to something.
				</p>
			</section>

			{/* Categories */}
			<section id="categories" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.map" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Categories</h2>
				</div>
				<p className={styles.body}>Four lanes of lifestyle work where housing, meals, and pay are part of the deal:</p>
				<div className={styles.pillRow}>
					<span className={`${styles.badge} ${styles.badgeGold}`}>
						<Icon name="category.farm" size={16} aria-hidden />
						Farm &amp; Ranch
					</span>
					<span className={`${styles.badge} ${styles.badgeSky}`}>
						<Icon name="category.maritime" size={16} aria-hidden />
						Maritime
					</span>
					<span className={`${styles.badge} ${styles.badgeMuted}`}>
						<Icon name="category.remote" size={16} aria-hidden />
						Remote
					</span>
					<span className={`${styles.badge} ${styles.badgeGold}`}>
						<Icon name="category.seasonal" size={16} aria-hidden />
						Seasonal
					</span>
				</div>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Farm &amp; Ranch</strong> — agricultural work, ranches, homesteads, and land-based operations.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Maritime</strong> — boats, charters, marine research, sailing crews, coastal hospitality.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Remote</strong> — location-independent roles and remote outposts where the setting is part of the job.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span><strong>Seasonal</strong> — ski resorts, lodges, national park concessions, harvest seasons, festival operations.</span></li>
				</ul>
			</section>

			{/* How it works */}
			<section id="how-it-works" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>How it works</h2>
				</div>
				<p className={styles.body}>Three ways to discover. One place to apply.</p>
				<div className={styles.pillRow}>
					<span className={`${styles.badge} ${styles.badgeSky}`}>
						<Icon name="nav.seek" size={16} aria-hidden />
						Seek — filter &amp; browse
					</span>
					<span className={`${styles.badge} ${styles.badgeGold}`}>
						<Icon name="nav.swipe" size={16} aria-hidden />
						Swipe — fast decisions
					</span>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>
						<Icon name="nav.map" size={16} aria-hidden />
						Map — place-first
					</span>
				</div>
				<p className={styles.body}>
					Hosts review applications and message seekers through the platform. The whole conversation happens in one place. Hosts subscribe to list — seekers apply for free.
				</p>
			</section>

			{/* Trust & safety */}
			<section id="trust-safety" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Verified Host badge &amp; your safety</h2>
				</div>
				<p className={styles.body}>
					A host earns the Verified Host badge automatically once they&rsquo;re on an active paid plan — it isn&rsquo;t self-declared, and it isn&rsquo;t something an admin manually grants. It shows a host has invested in the platform.
				</p>
				<div className={`${styles.callout} ${styles.calloutGold}`}>
					<span className={styles.calloutIcon}>
						<Icon name="system.warning" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>The badge is not an identity or background check.</p>
						<p className={styles.calloutText}>
							It does not mean we&rsquo;ve independently verified a host&rsquo;s identity, property, or the claims on their listing. Always research a host, ask questions, and confirm the details in writing before you travel to work with them.
						</p>
					</div>
				</div>
			</section>

			{/* Why */}
			<section id="why" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.profile" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Why we built it</h2>
				</div>
				<p className={styles.body}>
					The best lifestyle work — on farms, boats, in remote lodges and seasonal mountain towns — is scattered across job boards, Facebook groups, and word of mouth. Almost none of it tells you what you need to know to say yes. You have to email, wait, ask, and often still get vague answers.
				</p>
				<div className={`${styles.callout} ${styles.calloutGreen}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>No burying the details.</p>
						<p className={styles.calloutText}>No bait-and-switch listings. Just honest opportunities in honest places. We thought seekers deserved a straight answer before they committed to anything.</p>
					</div>
				</div>
				<p className={styles.body}>
					Explore &amp; Earn is an early, pre-launch product made by Automated Empires. We&rsquo;re building it in public, and improving it as real seekers and hosts use it.
				</p>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Get in touch</h2>
				</div>
				<p className={styles.body}>Want to list an opportunity, share feedback, or just say hello?</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
