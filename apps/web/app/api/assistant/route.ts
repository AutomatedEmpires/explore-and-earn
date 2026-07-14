import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { auth } from "@clerk/nextjs/server";
import { getHostProfile, getSeekerProfile } from "@explore-and-earn/db";

import {
  logAssistantTurn,
  logHostAssistantTurn,
} from "../../../services/assistant/persistence";
import { checkRateLimitDistributed } from "../../../lib/rateLimit";
import { buildHostTools } from "../../../services/assistant/hostTools";
import { hostSystemPrompt, seekerSystemPrompt } from "../../../services/assistant/systemPrompt";
import { buildSeekerTools } from "../../../services/assistant/tools";

// Allow streaming responses up to 60s — a 5-step tool loop can exceed 30.
export const maxDuration = 60;

/**
 * Context-aware AI assistant endpoint — one route, two personas.
 *
 * The client declares which surface it's on via `context` ("seeker" | "host").
 * Seeker is the default; host is only honored for callers who actually own a
 * host profile (so tool identity can never cross the role boundary). In both
 * cases identity is closed over inside the tools — the model can only ever act
 * as the authenticated user. Routed through the Vercel AI Gateway via a plain
 * "provider/model" string, overridable with ASSISTANT_MODEL.
 */
const MODEL = process.env.ASSISTANT_MODEL ?? "anthropic/claude-sonnet-4.5";

// The one endpoint that spends real AI-gateway money per call gets the same
// abuse guards as every write action: a per-user request budget plus a hard
// cap on conversation size (the model only needs the recent window anyway).
const MAX_MESSAGES = 40;
const MAX_BODY_BYTES = 64 * 1024;
// Per-message text cap. Independent of MAX_BODY_BYTES: a single giant message
// (or a few) is both a memory-DoS vector and an AI-cost vector even when the
// overall body is under the byte cap. Bounds the total text across a message's
// parts.
const MAX_MESSAGE_CHARS = 8 * 1024;

type AssistantContext = "seeker" | "host";

function normalizeContext(value: unknown): AssistantContext {
  return value === "host" ? "host" : "seeker";
}

/**
 * Read a request body with a HARD byte cap enforced on the actual bytes read —
 * NOT on the client-supplied Content-Length header (which is trivially spoofed
 * or omitted with chunked transfer encoding). Aborts as soon as the accumulated
 * chunks exceed `maxBytes`, so an attacker can never stream an unbounded body
 * into memory. Returns null when the cap is exceeded or the body can't be read.
 */
async function readCappedBodyText(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  const body = req.body;
  if (!body) {
    // No stream (e.g. some runtimes): fall back to text() but still cap after.
    try {
      const text = await req.text();
      return byteLength(text) > maxBytes ? null : text;
    } catch {
      return null;
    }
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Total text length across a UI message's parts (best-effort, bounded scan). */
function messageTextLength(message: unknown): number {
  if (typeof message !== "object" || message === null) return 0;
  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts) {
    if (typeof part === "object" && part !== null) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") total += text.length;
    }
    if (total > MAX_MESSAGE_CHARS) break;
  }
  return total;
}

export async function POST(req: Request): Promise<Response> {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Defense-in-depth degrade: the /assistant page already renders a "not
  // available" state when no gateway key is configured, so this guard is only
  // reached by a direct call in an unconfigured environment.
  if (!process.env.AI_GATEWAY_API_KEY) {
    return new Response("Assistant is not configured.", { status: 503 });
  }

  const limited = await checkRateLimitDistributed(`assistant:${userId}`, 20, 5 * 60 * 1000);
  if (!limited.allowed) {
    return new Response("Too many requests — give it a few minutes.", { status: 429 });
  }

  // Byte-accurate cap on the ACTUAL body stream — Content-Length is not trusted
  // (spoofable / absent under chunked encoding). readCappedBodyText aborts the
  // read the moment the bytes exceed MAX_BODY_BYTES, so an oversized body can
  // never be buffered into memory.
  const rawBody = await readCappedBodyText(req, MAX_BODY_BYTES);
  if (rawBody === null) {
    return new Response("Conversation too large.", { status: 413 });
  }

  const body = ((): { messages?: unknown; context?: unknown; page?: unknown } | null => {
    try {
      return JSON.parse(rawBody) as { messages?: unknown; context?: unknown; page?: unknown };
    } catch {
      return null;
    }
  })();
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response("Invalid request body.", { status: 400 });
  }
  const messages = body.messages.slice(-MAX_MESSAGES) as UIMessage[];
  // Bound per-message length: reject if any retained message's text exceeds the
  // cap (memory + AI-cost guard, independent of the whole-body byte cap).
  if (messages.some((message) => messageTextLength(message) > MAX_MESSAGE_CHARS)) {
    return new Response("Message too large.", { status: 413 });
  }
  const context = normalizeContext(body.context);
  // What the visitor is looking at — lets "is this right for me?" work with
  // zero typing (explain_match needs a listing id the user would never type).
  const rawPage = (body.page ?? null) as {
    pathname?: unknown;
    listingId?: unknown;
    listingTitle?: unknown;
  } | null;
  const pageLine = rawPage
    ? [
        typeof rawPage.pathname === "string" && rawPage.pathname.startsWith("/")
          ? `The user is currently on ${rawPage.pathname.slice(0, 120)}.`
          : null,
        typeof rawPage.listingId === "string" && /^[0-9a-f-]{36}$/i.test(rawPage.listingId)
          ? `They are viewing listing ${typeof rawPage.listingTitle === "string" ? `"${rawPage.listingTitle.slice(0, 120)}" ` : ""}(id ${rawPage.listingId}).`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  const token = await getToken();
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  // ── Host (listing coach) ──────────────────────────────────────────────────
  // Only honored for real hosts; otherwise fall through to the seeker persona so
  // a mis-declared context can never grant host tools. Persisted per host, like
  // the seeker guide (migration 055 made assistant_threads role-agnostic).
  if (context === "host") {
    const hostProfile = token ? await getHostProfile(token, userId) : null;
    if (hostProfile) {
      const result = streamText({
        model: MODEL,
        system:
          hostSystemPrompt({
            hostName: hostProfile.hostName,
            companyName: hostProfile.companyName,
          }) + (pageLine ? `\n\n${pageLine}` : ""),
        messages: await convertToModelMessages(messages),
        tools: token ? buildHostTools({ token, userId }) : {},
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1500,
        onFinish: async ({ text }) => {
          await logHostAssistantTurn({
            hostProfileId: hostProfile.id,
            clerkUserId: userId,
            userParts: lastUserMessage?.parts ?? [],
            assistantParts: [{ type: "text", text }],
          });
        },
      });
      return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
      });
    }
    // Not a host — degrade to the seeker persona below.
  }

  // ── Seeker (discovery + resume coach), default ────────────────────────────
  const profile = token ? await getSeekerProfile(token, userId) : null;

  const result = streamText({
    model: MODEL,
    system:
      seekerSystemPrompt({
        seekerName: profile?.displayName ?? null,
        onboardingComplete: profile?.onboardingComplete ?? false,
      }) + (pageLine ? `\n\n${pageLine}` : ""),
    messages: await convertToModelMessages(messages),
    // Identity is closed over inside the tools; the model cannot act as anyone
    // but this seeker. No token → no tools (the model can still converse).
    tools: token ? buildSeekerTools({ token, userId }) : {},
    // Bound tool-loop for cost + runaway control.
    stopWhen: stepCountIs(5),
    maxOutputTokens: 1500,
    onFinish: async ({ text }) => {
      if (!profile) return;
      await logAssistantTurn({
        seekerProfileId: profile.id,
        clerkUserId: userId,
        userParts: lastUserMessage?.parts ?? [],
        assistantParts: [{ type: "text", text }],
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
