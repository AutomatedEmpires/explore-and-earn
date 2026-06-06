import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getMessages } from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
import { MessageTranscript } from "../../../../components/messaging/MessageTranscript";
import { ReplyForm } from "../../../../components/messaging/ReplyForm";

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

	const token = await getToken();
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

	const messages = await getMessages(token, userId, id);

	return (
		<BucketPage title="Conversation" description={PAGE_DESCRIPTION}>
			<MessageTranscript messages={messages} viewerType="seeker" />
			<ReplyForm conversationId={id} placeholder="Write a message…" />
		</BucketPage>
	);
}
