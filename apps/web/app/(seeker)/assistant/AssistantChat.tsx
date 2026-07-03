"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

import { Icon } from "@explore-and-earn/ui";

import styles from "./assistant.module.css";

const SUGGESTIONS = [
  "Find farm work with housing included",
  "Which opportunities fit me best?",
  "How can I improve my profile?",
  "Where do my applications stand?",
] as const;

/**
 * Seeker assistant chat panel. Streams from /api/assistant (auth-scoped tools).
 * Renders text parts of each message; tool activity streams into the assistant
 * turn transparently. Premium, borders-first, token-driven.
 */
export function AssistantChat() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.transcript} aria-live="polite">
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Ask your guide</p>
            <p className={styles.emptySub}>
              Find opportunities, understand why they match you, and sharpen your profile.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? styles.userMsg : styles.assistantMsg}
          >
            {message.parts.map((part, index) =>
              part.type === "text" ? <span key={index}>{part.text}</span> : null,
            )}
          </div>
        ))}

        {busy && (
          <div className={styles.assistantMsg}>
            <span className={styles.typing} aria-label="Assistant is thinking">
              …
            </span>
          </div>
        )}
        {error && (
          <div className={styles.errorNote}>The assistant hit a snag. Please try again.</div>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <input
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about opportunities, matches, your profile…"
          disabled={busy}
          aria-label="Message the assistant"
        />
        <button
          className={styles.send}
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
        >
          <Icon name="action.apply" size={20} aria-hidden />
        </button>
      </form>
    </div>
  );
}
