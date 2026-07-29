import {
  getConversations,
  getSeekerDisplayNames,
  resolveSeekerName,
} from "@explore-and-earn/db";

import { formatDate } from "../../../../../lib/format";
import { loadMessageListData } from "../../../../../lib/messageListData";
import type { HostConversationSummary } from "../../../../../components/host";

/**
 * One loader for both message routes.
 *
 * The index and the conversation render the SAME workspace, so they need the
 * same thread list; duplicating this in two `page.tsx` files is how the list on
 * one route drifts from the list on the other — a candidate present in the rail
 * and absent from the index, with nothing to explain the difference. The
 * conversation route needs the list anyway, because the workspace shows it
 * beside the transcript at desktop widths.
 */

function formatUpdated(iso: string | null): string {
  if (!iso) return "No activity yet";
  // Guarded before formatting: `formatDate` wraps toLocaleDateString, which
  // renders "Invalid Date" rather than throwing on a bad timestamp.
  if (Number.isNaN(new Date(iso).getTime())) return "No activity yet";
  return formatDate(iso, { month: "short", day: "numeric" });
}

export async function loadHostConversations(
  token: string,
  userId: string,
): Promise<readonly HostConversationSummary[]> {
  const conversations = await getConversations(token, userId, "host");
  if (conversations.length === 0) return [];

  const [{ contexts, lastMessages }, seekerDisplayNames] = await Promise.all([
    loadMessageListData({
      token,
      userId,
      route: "/host/messages",
      conversationIds: conversations.map((conversation) => conversation.id),
    }),
    getSeekerDisplayNames(
      token,
      conversations.map((conversation) => conversation.seekerProfileId),
    ),
  ]);

  // The list is the page; names decorate it. A lookup fault is logged and the
  // pseudonymous handle stands — never laundered into a placeholder that would
  // be indistinguishable from the bug migration 084 fixed.
  if (seekerDisplayNames.status === "unavailable") {
    console.error(
      "[host/messages] applicant name lookup failed:",
      seekerDisplayNames.reason,
    );
  }

  return conversations.map((conversation) => {
    const context = contexts.get(conversation.id) ?? null;
    const lastMessage = lastMessages.get(conversation.id) ?? null;
    return {
      id: conversation.id,
      applicantName: resolveSeekerName(
        seekerDisplayNames,
        conversation.seekerProfileId,
        "Seeker",
      ),
      // The context RPC resolves the listing title; `conversations.listing_id`
      // is `on delete set null`, so both can legitimately be absent and the
      // workspace says so rather than inventing a subject line.
      listingTitle: context?.listingTitle ?? null,
      listingId: conversation.listingId,
      applicationId: conversation.applicationId,
      preview: lastMessage?.body ?? "No messages yet",
      unread: lastMessage
        ? lastMessage.senderType !== "host" && !lastMessage.readAt
        : false,
      updatedIso: conversation.lastMessageAt,
      updatedLabel: formatUpdated(conversation.lastMessageAt),
    } satisfies HostConversationSummary;
  });
}
