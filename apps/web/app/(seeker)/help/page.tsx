import type { Metadata } from "next";

import { BucketPage, HelpPanel, HELP_ITEMS } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Help",
};

export default function HelpPage() {
	return (
		<BucketPage
			title="Get help"
			description="Support, safety, and account help."
		>
			<HelpPanel items={HELP_ITEMS} />
		</BucketPage>
	);
}
