import "server-only";

import {
  getConversationContexts,
  getLastMessagesForConversations,
  type ConversationContext,
  type Message,
} from "@explore-and-earn/db";

import { reportMessage } from "./sentry";

interface LoadMessageListDataInput {
  readonly token: string;
  readonly userId: string;
  readonly route: "/messages" | "/host/messages";
  readonly conversationIds: readonly string[];
}

interface MessageListData {
  readonly contexts: ReadonlyMap<string, ConversationContext>;
  readonly lastMessages: ReadonlyMap<string, Message>;
}

/**
 * Shared, bounded list-page reads for both messaging roles. The participant
 * context RPC may be temporarily unavailable while migration 075 rolls out;
 * that degraded state keeps rendering safe labels and emits one warning.
 */
export async function loadMessageListData({
  token,
  userId,
  route,
  conversationIds,
}: LoadMessageListDataInput): Promise<MessageListData> {
  const [contextResult, lastMessages] = await Promise.all([
    getConversationContexts(token, conversationIds),
    getLastMessagesForConversations(token, conversationIds),
  ]);

  if (!contextResult.available) {
    reportMessage("conversation_context_rpc_unavailable", "warning", {
      route,
      userId,
    });
  }

  return {
    contexts: contextResult.contexts,
    lastMessages,
  };
}
