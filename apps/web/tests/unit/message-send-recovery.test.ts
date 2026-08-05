import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import type { Message } from "@explore-and-earn/db/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/messaging/ReplyForm", () => ({
  ReplyForm: () => null,
}));
vi.mock("../../components/discovery", () => ({
  EmptyState: () => null,
}));

const { findPersistedDelivery } = await import(
  "../../components/messaging/MessageTranscript"
);

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-new",
    conversationId: "conversation-1",
    senderType: "host",
    senderProfileId: "host-1",
    body: "Can you arrive Sunday?",
    readAt: null,
    createdAt: "2026-08-05T15:00:05.000Z",
    ...overrides,
  };
}

describe("ambiguous delivery matching", () => {
  const attempt = message({
    id: "optimistic-1",
    createdAt: "2026-08-05T15:00:00.000Z",
  });

  it("accepts only a newly observed row from the same sender with the same body", () => {
    const persisted = message();

    expect(findPersistedDelivery([persisted], attempt, new Set())).toEqual(
      persisted,
    );
    expect(
      findPersistedDelivery(
        [message({ senderType: "seeker" })],
        attempt,
        new Set(),
      ),
    ).toBeNull();
    expect(
      findPersistedDelivery(
        [message({ body: "A different reply" })],
        attempt,
        new Set(),
      ),
    ).toBeNull();
  });

  it("does not mistake an older known duplicate or a late row for this attempt", () => {
    const duplicate = message({ id: "message-known" });

    expect(
      findPersistedDelivery([duplicate], attempt, new Set([duplicate.id])),
    ).toBeNull();
    expect(
      findPersistedDelivery(
        [message({ createdAt: "2026-08-05T15:01:00.000Z" })],
        attempt,
        new Set(),
      ),
    ).toBeNull();
  });
});

describe("recoverable message sending", () => {
  const transcript = () => read("components/messaging/MessageTranscript.tsx");
  const form = () => read("components/messaging/ReplyForm.tsx");

  it("reconciles an ambiguous delivery once before returning the failure", () => {
    const source = transcript();

    expect(source).toContain('result.error === "delivery_unconfirmed"');
    expect(source).toMatch(
      /result\.error === "delivery_unconfirmed"[\s\S]{0,1200}fetchConversationMessagesAction/,
    );
    expect(source).toContain("findPersistedDelivery(");
    expect(source).toContain("knownBeforeSend");
    expect(source).toMatch(/if \(persisted\)[\s\S]{0,300}return \{ ok: true \}/);
  });

  it("turns a rejected action into an ambiguous result and removes only its temp row", () => {
    const source = transcript();

    expect(source).toMatch(/catch \{[\s\S]{0,400}result = DELIVERY_UNCONFIRMED/);
    expect(source).toContain(
      "setMessages((current) => current.filter((m) => m.id !== tempId))",
    );
    expect(source).not.toContain("setMessages([])");
  });

  it("reports a send only after persistence or successful reconciliation", () => {
    const source = transcript();
    const accepted = source.indexOf("if (result.ok)");
    const acceptedEvent = source.indexOf("onSent?.()", accepted);
    const reconciled = source.indexOf("if (persisted)");
    const reconciledEvent = source.indexOf("onSent?.()", reconciled);

    expect(accepted).toBeGreaterThan(-1);
    expect(acceptedEvent).toBeGreaterThan(accepted);
    expect(reconciled).toBeGreaterThan(acceptedEvent);
    expect(reconciledEvent).toBeGreaterThan(reconciled);
  });

  it("keeps the draft, restores its selection, and closes the rapid-double-submit gap", () => {
    const source = form();

    expect(source).toContain("submitGuardRef.current");
    expect(source).toContain("if (disabled || submitGuardRef.current) return");
    expect(source).toContain("setSelectionRange(");
    expect(source).toMatch(/if \(result\.ok\)[\s\S]{0,160}setBody\(""\)/);
    expect(source.match(/setBody\(""\)/g)).toHaveLength(1);
    expect(source).toContain('failure?.retryable ? "Try again" : "Send"');
  });

  it("links the announced failure to a busy, focus-preserving composer", () => {
    const source = form();
    const css = read("components/messaging/ReplyForm.module.css");

    expect(source).toContain("aria-busy={isPending}");
    expect(source).toContain("aria-describedby={error ? errorId : undefined}");
    expect(source).toContain("aria-invalid={Boolean(error)}");
    expect(source).toContain('id={errorId} className={styles.error} role="alert"');
    expect(source).toContain("readOnly={isPending}");
    expect(css).toContain("min-height: var(--tap-min)");
  });

  it("remounts state per conversation and announces new transcript entries", () => {
    const source = transcript();

    expect(source).toContain(
      "<ConversationTranscript key={props.conversationId} {...props} />",
    );
    expect(source).toContain('role="log"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-relevant="additions text"');
  });
});
