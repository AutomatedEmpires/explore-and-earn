import type { Metadata } from "next";

export const dynamic = "force-static";

export function generateMetadata(): Metadata {
	return {
		title: "About",
		description:
			"Explore & Earn is a lifestyle-driven opportunity marketplace built for seekers \u2014 every opportunity answers three questions: housing, meals, and pay.",
	};
}

export default function AboutPage() {
	return (
		<>
			<h1>About Explore & Earn</h1>
			<p>
				Explore & Earn is a lifestyle-driven opportunity marketplace built for
				seekers — people who want work that comes with a place to live, food to
				eat, and pay in their pocket, in places worth waking up in.
			</p>

			<h2>The three questions</h2>
			<p>
				Most opportunity listings bury the things that actually matter. We put
				them first. Every opportunity on Explore & Earn answers three questions
				up front:
			</p>
			<ul>
				<li>
					<strong>Housing</strong> — is a place to stay included?
				</li>
				<li>
					<strong>Meals</strong> — is food provided?
				</li>
				<li>
					<strong>Pay</strong> — what will you earn?
				</li>
			</ul>
			<p>
				No digging, no guesswork. If a host can’t answer those three, the
				listing isn’t ready.
			</p>

			<h2>Why we built it</h2>
			<p>
				Explore & Earn started with a simple frustration: the best lifestyle
				work — on farms, boats, in remote lodges and seasonal towns — is
				scattered across job boards, group chats, and word of mouth, and almost
				none of it tells you what you need to know to say yes. We thought
				seekers deserved a straight answer, so we built a marketplace around the
				three questions and the people asking them.
			</p>
			<p>
				We’re an early, pre-launch product made by Automated Empires. We’re
				building it in the open and improving it as real seekers and hosts use
				it.
			</p>

			<h2>Get in touch</h2>
			<p>
				Want to talk, host an opportunity, or share feedback? Email{" "}
				<a href="mailto:jackson@automatedempires.com">
					jackson@automatedempires.com
				</a>
				.
			</p>
		</>
	);
}
