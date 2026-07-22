import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getConversations } from "@explore-and-earn/db";

import { devFallback } from "../../../../lib/devBench/fallback";
import { loadMessageListData } from "../../../../lib/messageListData";
import { EmptyState } from "../../../../components/discovery";
import {
	BucketPage,
	MessageList,
	type MessageThread,
} from "../../../../components/seeker";

export const metadata: Metadata = {
	title: "Messages",
};

export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION =
	"Conversations scoped to your applications, invites, and offers.";

function formatTimeAgo(iso: string | null): string {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const minutes = Math.floor((Date.now() - then) / 60000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

export default async function MessagesPage() {
	const { userId, getToken } = await auth();
	if (!userId) {
		return (
			<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="Sign in to see your messages"
					message="Conversations with hosts appear here once you apply, get invited, or receive an offer."
				/>
			</BucketPage>
		);
	}

	const token = await getToken();
	if (!token) {
		return (
			<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="Sign in to see your messages"
					message="Conversations with hosts appear here once you apply, get invited, or receive an offer."
				/>
			</BucketPage>
		);
	}

	const conversations = await devFallback(
		getConversations(token, userId, "seeker"),
		[],
	);

	if (conversations.length === 0) {
		return (
			<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="No messages yet"
					message="Conversations with hosts appear here once you apply, get invited, or receive an offer."
					actionLabel="Browse opportunities"
					actionHref="/seek"
				/>
			</BucketPage>
		);
	}

	// Batch-fetch stable participant-only context and last messages. Unlike the
	// public listing query, this preserves labels after a listing closes.
	const conversationIds = conversations.map((c) => c.id);

	const { contexts, lastMessages } = await loadMessageListData({
		token,
		userId,
		route: "/messages",
		conversationIds,
	});

	const threads: MessageThread[] = conversations.map((conversation) => {
		const context = contexts.get(conversation.id) ?? null;
		const lastMessage = lastMessages.get(conversation.id) ?? null;
		return {
			id: conversation.id,
			hostName: context?.hostName || "Host",
			listingTitle: context?.listingTitle || "Conversation",
			category: context?.listingCategory ?? "mix",
			preview: lastMessage?.body ?? "No messages yet",
			timeAgo: formatTimeAgo(conversation.lastMessageAt),
			unread: lastMessage
				? lastMessage.senderType !== "seeker" && !lastMessage.readAt
				: false,
		};
	});

	return (
		<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
			<MessageList threads={threads} />
		</BucketPage>
	);
}
