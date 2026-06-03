import { BucketPage, HelpPanel, HELP_ITEMS } from "../../../components/seeker";

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
