import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
	getConversations,
	getLastMessagesForConversations,
	getPublicListingsByIds,
	rowToDiscoveryFields,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../components/discovery";
import {
	BucketPage,
	MessageList,
	type MessageThread,
} from "../../../components/seeker";

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

	const token = await getToken({ template: "supabase" });
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

	const conversations = await getConversations(token, userId, "seeker");

	if (conversations.length === 0) {
		return (
			<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
				<EmptyState
					title="No messages yet"
					message="Conversations with hosts appear here once you apply, get invited, or receive an offer."
				/>
			</BucketPage>
		);
	}

	// Batch-fetch every conversation's listing and last message in two queries
	// (replaces the previous per-conversation getMessages N+1).
	const listingIds = conversations
		.map((conversation) => conversation.listingId)
		.filter((id): id is string => id !== null);
	const conversationIds = conversations.map((c) => c.id);

	const [listingRows, lastMessageMap] = await Promise.all([
		getPublicListingsByIds(listingIds),
		getLastMessagesForConversations(token, conversationIds),
	]);
	const listingById = new Map(listingRows.map((row) => [row.id, row] as const));

	const threads: MessageThread[] = conversations.map((conversation) => {
		const listingRow = conversation.listingId
			? listingById.get(conversation.listingId) ?? null
			: null;
		const listing = listingRow ? rowToDiscoveryFields(listingRow) : null;
		const lastMessage = lastMessageMap.get(conversation.id) ?? null;
		return {
			id: conversation.id,
			hostName: listing?.host.name ?? "Host",
			listingTitle: listing?.title ?? "Conversation",
			category: listing?.category ?? "mix",
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
