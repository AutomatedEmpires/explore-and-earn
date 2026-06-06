import type { Metadata } from "next";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Privacy Policy",
		description:
			"What data Explore & Earn collects, how it’s used, who processes it, and the rights you have over it.",
	};
}

export default function PrivacyPage() {
	return (
		<>
			<h1>Privacy Policy</h1>
			<p className={styles.updated}>Last updated: June 2026</p>
			<p>
				This policy explains what we collect, why, and what you can do about it.
				Explore & Earn is operated by Automated Empires.
			</p>

			<h2>What we collect</h2>
			<ul>
				<li>
					<strong>Account information</strong> — when you sign up, our
					authentication provider, Clerk, collects your name, email, and login
					credentials so we can verify who you are.
				</li>
				<li>
					<strong>Application data</strong> — the listings, applications, and
					profile details you create, including the housing, meals, and pay
					information relevant to an opportunity.
				</li>
				<li>
					<strong>Messages</strong> — the messages you exchange with hosts or
					seekers through the platform.
				</li>
				<li>
					<strong>Usage analytics</strong> — we use PostHog to understand how
					people use Explore & Earn, such as which pages are visited and which
					features are used.
				</li>
			</ul>

			<h2>How we use it</h2>
			<p>
				We use your information to run the platform: to create and secure your
				account, to match seekers with relevant opportunities, to let hosts and
				seekers communicate, and to improve the product. We don’t use your data
				to make automated decisions that have legal effects on you.
			</p>

			<h2>Who processes your data</h2>
			<ul>
				<li>
					<strong>Clerk</strong> handles authentication and stores your login
					credentials as our auth processor.
				</li>
				<li>
					<strong>Supabase</strong> hosts our application database as our data
					processor.
				</li>
				<li>
					<strong>PostHog</strong> processes product usage analytics on our
					behalf.
				</li>
			</ul>
			<p>
				These providers process data under agreements with us, and only for the
				purposes of operating Explore & Earn.
			</p>

			<h2>We don’t sell your data</h2>
			<p>
				We don’t sell your personal information, and we never have. We don’t
				share it with third parties for their own marketing.
			</p>

			<h2>Your rights</h2>
			<p>
				You can access the information associated with your account, correct it,
				or ask us to delete it. To request access or deletion, email{" "}
				<a href="mailto:jackson@automatedempires.com">
					jackson@automatedempires.com
				</a>{" "}
				and we’ll take care of it.
			</p>

			<h2>Analytics choices</h2>
			<p>
				You can opt out of analytics at any time using the cookie banner.
				Choosing “Essential only” turns off PostHog analytics in your browser.
			</p>

			<h2>Contact</h2>
			<p>
				Email{" "}
				<a href="mailto:jackson@automatedempires.com">
					jackson@automatedempires.com
				</a>{" "}
				with any privacy questions.
			</p>
		</>
	);
}
