"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@explore-and-earn/ui";

import styles from "./assistant.module.css";

/** Which persona the /api/assistant route should answer as. */
export type AssistantContext = "seeker" | "host";

/** What the visitor is looking at — appended server-side as system context. */
export interface AssistantPageContext {
  readonly pathname?: string;
  readonly listingId?: string;
  readonly listingTitle?: string;
}

export interface AssistantChatProps {
  /** Persona sent to the route; defaults to the seeker guide. */
  readonly context?: AssistantContext;
  /** Persisted transcript (latest thread) so the conversation resumes. */
  readonly initialMessages?: ReadonlyArray<{
    readonly id: string;
    readonly role: "user" | "assistant";
    readonly parts: unknown[];
  }>;
  /** Current-surface context (e.g. the listing being viewed). */
  readonly page?: AssistantPageContext;
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

/** find_opportunities tool output row (services/assistant/tools.ts). */
interface FoundListing {
  readonly id?: string;
  readonly title?: string;
  readonly location?: string | null;
  readonly housing?: boolean;
  readonly meals?: boolean;
  readonly payMinCents?: number | null;
}

function isFoundListings(output: unknown): output is FoundListing[] {
  return (
    Array.isArray(output) &&
    output.length > 0 &&
    typeof (output[0] as FoundListing)?.id === "string" &&
    typeof (output[0] as FoundListing)?.title === "string"
  );
}

/** Compact, CLICKABLE result cards — found listings become destinations. */
function FoundListingCards({ listings }: { listings: FoundListing[] }) {
  return (
    <div className={styles.toolCards}>
      {listings.slice(0, 6).map((l) => (
        <Link key={l.id} href={`/listing/${l.id}`} className={styles.toolCard}>
          <span className={styles.toolCardTitle}>{l.title}</span>
          {l.location ? (
            <span className={styles.toolCardMeta}>
              <Icon name="nav.map" size={16} aria-hidden />
              {l.location}
            </span>
          ) : null}
          <span className={styles.toolCardChips}>
            {l.housing ? (
              <span className={styles.toolChip}>
                <Icon name="benefit.housing" size={16} aria-hidden />
                Housing
              </span>
            ) : null}
            {l.meals ? (
              <span className={styles.toolChip}>
                <Icon name="benefit.meals" size={16} aria-hidden />
                Meals
              </span>
            ) : null}
            {l.payMinCents != null ? (
              <span className={styles.toolChip}>
                <Icon name="benefit.pay" size={16} aria-hidden />
                {`$${Math.round(l.payMinCents / 100)}+`}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Assistant chat panel — one component, context-aware. Streams from
 * /api/assistant with auth-scoped tools; the `context` prop selects the
 * persona. The latest persisted thread resumes; find_opportunities results
 * render as clickable listing cards (the assistant is a discovery surface,
 * not a text describer). Premium, borders-first, token-driven.
 */
export function AssistantChat({
  context = "seeker",
  initialMessages,
  page,
  emptyTitle = "Ask your guide",
  emptySub = "Find opportunities, understand why they match you, and sharpen your profile.",
  suggestions = SEEKER_SUGGESTIONS,
  placeholder = "Ask about opportunities, matches, your profile…",
}: AssistantChatProps) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant", body: { context, page } }),
    messages: (initialMessages ?? []) as unknown as UIMessage[],
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as it streams (respect reduced motion).
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.transcript}>
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
            {message.parts.map((part, index) => {
              if (part.type === "text") return <span key={index}>{part.text}</span>;
              // Tool results: found listings become clickable cards.
              const maybeTool = part as { type: string; state?: string; output?: unknown };
              if (
                maybeTool.type === "tool-find_opportunities" &&
                maybeTool.state === "output-available" &&
                isFoundListings(maybeTool.output)
              ) {
                return <FoundListingCards key={index} listings={maybeTool.output} />;
              }
              return null;
            })}
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
        {/* SR announcement once per state change — a live region on the whole
            transcript re-announced every streamed token. */}
        <span className={styles.srOnly} aria-live="polite">
          {busy ? "Assistant is replying" : ""}
        </span>
        <div ref={endRef} />
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
