import {
	BucketPage,
	MESSAGE_THREADS,
	MessageList,
} from "../../../components/seeker";

export default function MessagesPage() {
	return (
		<BucketPage
			title="Messages"
			description="Conversations scoped to your applications, invites, and offers."
		>
			<MessageList threads={MESSAGE_THREADS} />
		</BucketPage>
	);
}
