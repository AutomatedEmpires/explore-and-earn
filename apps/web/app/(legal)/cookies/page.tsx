import type { Metadata } from "next";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Cookie Policy",
		description:
			"The cookies Explore & Earn sets \u2014 Clerk session, PostHog analytics, and functional \u2014 and how to opt out of analytics.",
	};
}

export default function CookiesPage() {
	return (
		<>
			<h1>Cookie Policy</h1>
			<p className={styles.updated}>Last updated: June 2026</p>
			<p>
				Cookies are small files your browser stores. We keep our use of them
				minimal. Here’s what we set and why.
			</p>

			<h2>Cookies we set</h2>
			<ul>
				<li>
					<strong>Clerk session</strong> — required cookies that keep you
					securely signed in. Without these, the platform can’t work.
				</li>
				<li>
					<strong>PostHog analytics</strong> — optional cookies that help us
					understand how Explore & Earn is used so we can improve it.
				</li>
				<li>
					<strong>Functional</strong> — cookies that remember your preferences,
					such as your cookie choice itself.
				</li>
			</ul>

			<h2>Opting out of analytics</h2>
			<p>
				When you first visit, a banner lets you choose “Accept analytics” or
				“Essential only.” Choosing “Essential only” opts you out of PostHog
				analytics, and we remember that choice. You can also clear cookies in
				your browser settings at any time. Essential cookies can’t be turned
				off, because they’re needed to keep you signed in.
			</p>

			<h2>Contact</h2>
			<p>
				Questions about cookies? Email{" "}
				<a href="mailto:jackson@automatedempires.com">
					jackson@automatedempires.com
				</a>
				.
			</p>
		</>
	);
}
