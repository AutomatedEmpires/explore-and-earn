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
import { checkRateLimit } from "../../../lib/rateLimit";
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

type AssistantContext = "seeker" | "host";

function normalizeContext(value: unknown): AssistantContext {
  return value === "host" ? "host" : "seeker";
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

  const limited = checkRateLimit(`assistant:${userId}`, 20, 5 * 60 * 1000);
  if (!limited.allowed) {
    return new Response("Too many requests — give it a few minutes.", { status: 429 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Conversation too large.", { status: 413 });
  }

  const body = (await req.json().catch(() => null)) as
    | { messages?: unknown; context?: unknown; page?: unknown }
    | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response("Invalid request body.", { status: 400 });
  }
  const messages = body.messages.slice(-MAX_MESSAGES) as UIMessage[];
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
