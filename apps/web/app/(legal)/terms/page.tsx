import type { Metadata } from "next";

import styles from "../legal.module.css";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "Terms of Service",
		description:
			"The terms for using Explore & Earn \u2014 an opportunity marketplace connecting seekers with hosts who offer housing, meals, and pay.",
	};
}

export default function TermsPage() {
	return (
		<>
			<h1>Terms of Service</h1>
			<p className={styles.updated}>Last updated: June 2026</p>
			<p>
				Welcome to Explore & Earn, a product of Automated Empires. These terms
				explain the deal between you and us when you use the platform. We have
				tried to keep them plain.
			</p>

			<h2>1. Accepting these terms</h2>
			<p>
				By creating an account or using Explore & Earn, you agree to these
				terms. If you don’t agree, please don’t use the platform.
			</p>

			<h2>2. What Explore & Earn is</h2>
			<p>
				Explore & Earn is an opportunity marketplace. We connect seekers with
				hosts who post lifestyle-driven opportunities that may include housing,
				meals, and pay. We are a marketplace and a point of introduction — we
				are not your employer, and we are not the employer of any host or
				seeker. Any working relationship, agreement, or arrangement is strictly
				between the host and the seeker.
			</p>

			<h2>3. No guarantees</h2>
			<p>
				We don’t guarantee that you’ll find an opportunity, be selected, or
				that any opportunity, host, or seeker is accurately described. Listings
				are created by hosts and applications are submitted by seekers. We do
				our best to keep the platform trustworthy, but we can’t promise
				outcomes, income, placements, or the conduct of any other user. You are
				responsible for your own due diligence before accepting or offering any
				opportunity.
			</p>

			<h2>4. Your conduct</h2>
			<p>
				You agree to use Explore & Earn honestly and lawfully. You won’t post
				false, misleading, or unlawful listings or applications; harass,
				threaten, or harm other users; misrepresent who you are; or use the
				platform to get around safety, payment, or verification features. Hosts
				must describe opportunities accurately, including the housing, meals,
				and pay involved.
			</p>

			<h2>5. Content and ownership</h2>
			<p>
				You keep ownership of the content you submit — your listings,
				applications, messages, and profile. By posting it, you give us a
				limited license to host, display, and share that content as needed to
				run the platform. Everything else — the Explore & Earn name, design,
				and software — belongs to Automated Empires.
			</p>

			<h2>6. Account termination</h2>
			<p>
				You can close your account at any time. We may suspend or remove
				accounts that violate these terms, put other users at risk, or misuse
				the platform. Where it’s reasonable to do so, we’ll tell you why.
			</p>

			<h2>7. Governing law</h2>
			<p>
				These terms are governed by the laws of the State of Delaware, without
				regard to its conflict-of-law rules. Any disputes will be handled in the
				courts located in Delaware.
			</p>

			<h2>8. Contact</h2>
			<p>
				Questions about these terms? Email us at{" "}
				<a href="mailto:jackson@automatedempires.com">
					jackson@automatedempires.com
				</a>
				.
			</p>
		</>
	);
}
