import type { Metadata } from "next";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { generateFaqJsonLd } from "../../../lib/seo";
import styles from "../legal.module.css";
import fa from "./faq.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "FAQ",
		description:
			"Answers to common questions about Explore & Earn — how applying works, whether it's free, what listings include (housing, meals, pay), and how hosting works.",
	};
}

type FaqItem = { question: string; answer: string };
type FaqGroup = { id: string; title: string; icon: IconKey; items: ReadonlyArray<FaqItem> };

const GROUPS: ReadonlyArray<FaqGroup> = [
	{
		id: "seekers",
		title: "For seekers",
		icon: "nav.seek",
		items: [
			{
				question: "Is Explore & Earn free for seekers?",
				answer:
					"Yes. Seekers pay nothing, ever. Browsing, swiping, saving, messaging, and applying are always free. Hosts fund the marketplace through subscriptions.",
			},
			{
				question: "What does a listing tell me before I apply?",
				answer:
					"Every listing answers the three questions up front: Housing (where you'll sleep), Meals (what you'll eat), and Pay (what you'll earn) — plus the role, location, dates, and host. No emailing to find out the basics.",
			},
			{
				question: "How do I apply to an opportunity?",
				answer:
					"Open a listing, review the housing, meals, and pay details, and tap Apply. You'll be asked to sign in or create a free account if you haven't already. Hosts review applications and message you on the platform.",
			},
			{
				question: "What kinds of work are on Explore & Earn?",
				answer:
					"Lifestyle work across four lanes: Farm & Ranch, Maritime (boats, charters, coastal hospitality), Remote, and Seasonal (ski resorts, lodges, national-park concessions, harvest and festival work).",
			},
			{
				question: "What happens after I apply?",
				answer:
					"You can track every application from your dashboard. Hosts may message you, send an offer, or send a direct invite to other roles. You can accept or decline offers and invites, and keep saved listings for later.",
			},
			{
				question: "Do I need experience?",
				answer:
					"It depends on the role. Each listing describes what the host is looking for. Building out your profile and resume helps hosts understand your background and makes your applications stronger.",
			},
		],
	},
	{
		id: "hosts",
		title: "For hosts",
		icon: "nav.profile",
		items: [
			{
				question: "How do I list an opportunity?",
				answer:
					"Create a host profile, then publish a listing. Every listing must answer the three questions — housing, meals, and pay — before it can go live. From there you can review applicants, message seekers, and send invites and offers.",
			},
			{
				question: "What does it cost to host?",
				answer:
					"Hosts subscribe to a plan to list. Current plan pricing is shown on the homepage and on your billing page. Seekers are always free; hosts fund the marketplace.",
			},
			{
				question: "What does boosting or featuring a listing do?",
				answer:
					"Boosted and featured placements give your listing and announcements more visibility in discovery. You can purchase these from your host dashboard. Pricing is shown at checkout.",
			},
			{
				question: "How do I review applicants?",
				answer:
					"Your host dashboard shows every applicant with their profile and resume. You can move applications through reviewing, offered, and accepted, message seekers directly, and send invites to seekers you'd like to reach out to.",
			},
		],
	},
	{
		id: "trust",
		title: "Trust & safety",
		icon: "trust.verified_host",
		items: [
			{
				question: "Are hosts verified?",
				answer:
					"Hosts can carry a verified badge. We also require every listing to answer housing, meals, and pay before going live — listings that can't aren't ready. You can report any listing or content that looks off.",
			},
			{
				question: "Is my data safe?",
				answer:
					"We collect only what's needed to run the marketplace and we don't sell your data. See our Privacy and Cookie policies for the full details on what we collect, how we use it, and your rights.",
			},
			{
				question: "How do I report a problem?",
				answer:
					"Use the report option on a listing or piece of content, or email us. Messaging happens on-platform so there's a clear record.",
			},
		],
	},
	{
		id: "contact",
		title: "Still have questions?",
		icon: "action.forward",
		items: [
			{
				question: "How do I get in touch?",
				answer:
					"Email jackson@automatedempires.com. Explore & Earn is an early, pre-launch product by Automated Empires, and we improve it as real seekers and hosts use it.",
			},
		],
	},
];

const ALL_ITEMS: ReadonlyArray<FaqItem> = GROUPS.flatMap((g) => g.items);

export default function FaqPage() {
	const faqJsonLd = generateFaqJsonLd(ALL_ITEMS);

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: faqJsonLd }}
			/>

			{/* Hero */}
			<div className={`${styles.hero} ${styles.heroAbout}`}>
				<span className={styles.heroIcon}>
					<Icon name="nav.seek" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>Frequently asked<br />questions</h1>
				<p className={styles.heroSub}>
					How Explore &amp; Earn works for seekers and hosts — what listings include, how applying works, and what it costs.
				</p>
				<div className={styles.heroBadgeRow}>
					<span className={`${styles.badge} ${styles.badgeGreen}`}>Seekers free, always</span>
					<span className={`${styles.badge} ${styles.badgeMuted}`}>Housing · Meals · Pay</span>
				</div>
			</div>

			{GROUPS.map((group) => (
				<section key={group.id} id={group.id} className={styles.section}>
					<div className={styles.sectionHead}>
						<span className={styles.sectionIcon}>
							<Icon name={group.icon} size={16} aria-hidden />
						</span>
						<h2 className={styles.sectionTitle}>{group.title}</h2>
					</div>
					<div className={fa.list}>
						{group.items.map((item) => (
							<div key={item.question} className={fa.item}>
								<h3 className={fa.q}>{item.question}</h3>
								<p className={fa.a}>{item.answer}</p>
							</div>
						))}
					</div>
				</section>
			))}
		</>
	);
}
