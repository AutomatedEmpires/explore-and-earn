"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

import { Icon } from "@explore-and-earn/ui";

import styles from "./assistant.module.css";

/** Which persona the /api/assistant route should answer as. */
export type AssistantContext = "seeker" | "host";

export interface AssistantChatProps {
  /** Persona sent to the route; defaults to the seeker guide. */
  readonly context?: AssistantContext;
  readonly emptyTitle?: string;
  readonly emptySub?: string;
  readonly suggestions?: readonly string[];
  readonly placeholder?: string;
}

const SEEKER_SUGGESTIONS = [
  "Find farm work with housing included",
  "Which opportunities fit me best?",
  "Help me sharpen my resume",
  "Where do my applications stand?",
] as const;

/**
 * Assistant chat panel — one component, context-aware. Streams from
 * /api/assistant with auth-scoped tools; the `context` prop selects the persona
 * (seeker discovery/resume coach vs host listing coach). Renders text parts;
 * tool activity streams into the assistant turn transparently. Premium,
 * borders-first, token-driven.
 */
export function AssistantChat({
  context = "seeker",
  emptyTitle = "Ask your guide",
  emptySub = "Find opportunities, understand why they match you, and sharpen your profile.",
  suggestions = SEEKER_SUGGESTIONS,
  placeholder = "Ask about opportunities, matches, your profile…",
}: AssistantChatProps) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant", body: { context } }),
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
            <p className={styles.emptyTitle}>{emptyTitle}</p>
            <p className={styles.emptySub}>{emptySub}</p>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion) => (
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
          placeholder={placeholder}
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
