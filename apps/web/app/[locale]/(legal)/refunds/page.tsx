import type { Metadata } from "next";
import { Icon } from "@explore-and-earn/ui";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Refund Policy",
		description:
			"How billing, cancellations, and refunds work on Explore & Earn — seekers are always free; hosts subscribe and can cancel anytime.",
	};
}

export default function RefundsPage() {
	return (
		<>
			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroRefunds}`}>
				<span className={styles.heroIcon}>
					<Icon name="benefit.pay" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Refund Policy</h1>
				<p className={styles.heroSub}>
					How host billing, cancellations, and refunds work — in plain language.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Seekers never charged</span>
					<span className={`${styles.badge} ${styles.badgeSky}`}>Cancel anytime</span>
					<span className={`${styles.badge} ${styles.badgeDate}`}>Updated July 2026</span>
				</div>
			</div>

			{/* Seekers */}
			<section id="seekers" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.seek" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Seekers pay nothing</h2>
				</div>
				<p className={styles.body}>
					Browsing, swiping, saving, messaging, and applying are free for seekers — always. Because seekers are never charged, there is nothing for a seeker to be refunded. This policy covers host billing only.
				</p>
				<div className={`${styles.callout} ${styles.calloutGreen}`}>
					<span className={styles.calloutIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>No seeker fees, ever.</p>
						<p className={styles.calloutText}>If you were ever charged as a seeker, it was a mistake — email us and we&rsquo;ll refund it in full.</p>
					</div>
				</div>
			</section>

			{/* Subscriptions */}
			<section id="subscriptions" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="status.begins" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Host subscriptions</h2>
				</div>
				<p className={styles.body}>
					Hosts access Explore &amp; Earn through a recurring subscription (monthly or annual). Subscriptions renew automatically at the start of each billing period until you cancel.
				</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Charges are billed in advance for the upcoming period.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Renewal payments are generally non-refundable once the new period has started.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>We don&rsquo;t prorate refunds for partial periods after a renewal, except where required by law.</span></li>
				</ul>
			</section>

			{/* Cancellations */}
			<section id="cancel" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="status.ends" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Cancellations</h2>
				</div>
				<p className={styles.body}>
					You can cancel your host subscription at any time from your billing page. When you cancel:
				</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Your plan stays active until the end of the period you&rsquo;ve already paid for.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>You won&rsquo;t be billed again after that period ends.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Cancelling stops future renewals — it doesn&rsquo;t retroactively refund the current period.</span></li>
				</ul>
				<div className={`${styles.callout} ${styles.calloutSky}`}>
					<span className={styles.calloutIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<div className={styles.calloutBody}>
						<p className={styles.calloutTitle}>Keep access through the period you paid for.</p>
						<p className={styles.calloutText}>Cancel whenever you like — your listings and dashboard stay live until the paid period ends.</p>
					</div>
				</div>
			</section>

			{/* When we do refund */}
			<section id="eligible" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="benefit.pay" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>When we&rsquo;ll issue a refund</h2>
				</div>
				<p className={styles.body}>We review refund requests case by case and will generally refund when:</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>You were charged in error, or charged twice for the same period.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>A billing or technical fault on our side prevented you from using a plan you paid for.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>A refund is required by the consumer-protection laws that apply to you.</span></li>
				</ul>
				<p className={styles.body}>
					Approved refunds are returned to your original payment method through our payment processor. It can take several business days for the refund to appear on your statement.
				</p>
			</section>

			{/* One-off purchases */}
			<section id="one-off" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="nav.swipe" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Boosts &amp; featured placements</h2>
				</div>
				<p className={styles.body}>
					One-off purchases such as boosting or featuring a listing are consumed as they run. Once a boost or featured placement has started delivering, it&rsquo;s generally non-refundable. If a paid placement never ran because of a fault on our side, contact us and we&rsquo;ll make it right.
				</p>
			</section>

			{/* How to request */}
			<section id="request" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>How to request a refund</h2>
				</div>
				<p className={styles.body}>
					Email us with the account email, the charge date, and a short note about what happened. We aim to respond within a few business days.
				</p>
				<ul className={styles.list}>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Include the last four digits of the charge or the invoice ID if you have it.</span></li>
					<li className={styles.listItem}><span className={styles.listDot} /><span>Please reach out to us before opening a chargeback so we can resolve it directly.</span></li>
				</ul>
			</section>

			{/* Contact */}
			<section id="contact" className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.forward" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Billing questions?</h2>
				</div>
				<p className={styles.body}>Anything about a charge, a plan, or a refund — email us.</p>
				<a href="mailto:jackson@automatedempires.com" className={styles.contactLink}>
					<Icon name="action.forward" size={16} aria-hidden />
					jackson@automatedempires.com
				</a>
			</section>
		</>
	);
}
