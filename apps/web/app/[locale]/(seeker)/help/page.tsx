import type { Metadata } from "next";

import { HelpCenter, HELP_FAQS, HELP_ITEMS, SeekerPage } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Help",
};

export default function HelpPage() {
	return (
		<SeekerPage
			title="Help center"
			description="Search answers on applying, housing, meals, pay, and safety — or reach the team."
		>
			<HelpCenter faqs={HELP_FAQS} items={HELP_ITEMS} />
		</SeekerPage>
	);
}
