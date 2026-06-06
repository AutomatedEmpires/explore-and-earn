import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import {
	getConversations,
	getMessages,
	getPublicListingById,
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

	const conversations = await getConversations(token, userId, "seeker");

	// TODO(perf): N+1 — each conversation fetches its listing + messages
	// individually. Replace with a batched conversation-summary query (listing
	// title/host + last-message preview) in @explore-and-earn/db once it exists.
	const threads: MessageThread[] = await Promise.all(
		conversations.map(async (conversation): Promise<MessageThread> => {
			const [listingRow, messages] = await Promise.all([
				conversation.listingId
					? getPublicListingById(conversation.listingId)
					: Promise.resolve(null),
				getMessages(token, userId, conversation.id),
			]);
			const listing = listingRow ? rowToDiscoveryFields(listingRow) : null;
			const lastMessage = messages[messages.length - 1];
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
		}),
	);

	return (
		<BucketPage title="Messages" description={PAGE_DESCRIPTION}>
			<MessageList threads={threads} />
		</BucketPage>
	);
}
