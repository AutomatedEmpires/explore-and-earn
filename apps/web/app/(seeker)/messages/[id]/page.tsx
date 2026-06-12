import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getMessages } from "@explore-and-earn/db";

import { markMessagesReadAction } from "../../../actions/messages";
import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
import { MessageTranscript } from "../../../../components/messaging/MessageTranscript";

export const metadata: Metadata = {
	title: "Conversation",
};

export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION = "Your message history with this host.";

export default async function SeekerMessageThreadPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const { userId, getToken } = await auth();
	if (!userId) {
		return (
			<BucketPage title="Conversation" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="Sign in to see this conversation"
					message="Your message history appears here once you sign in."
				/>
			</BucketPage>
		);
	}

	const token = await getToken({ template: "supabase" });
	if (!token) {
		return (
			<BucketPage title="Conversation" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="Sign in to see this conversation"
					message="Your message history appears here once you sign in."
				/>
			</BucketPage>
		);
	}

	// Fetch messages and mark inbound ones as read in parallel; a failed mark-read
	// must not block the page render. _markRead is void — the underscore prefix
	// signals the intentional discard.
	const [messages, _markRead] = await Promise.all([
		getMessages(token, userId, id),
		markMessagesReadAction(id),
	]);

	return (
		<BucketPage title="Conversation" description={PAGE_DESCRIPTION}>
			<MessageTranscript
				initialMessages={messages}
				conversationId={id}
				viewerType="seeker"
				replyPlaceholder="Write a message…"
			/>
		</BucketPage>
	);
}
