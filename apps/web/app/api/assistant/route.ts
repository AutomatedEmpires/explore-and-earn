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
import { buildHostTools } from "../../../services/assistant/hostTools";
import { hostSystemPrompt, seekerSystemPrompt } from "../../../services/assistant/systemPrompt";
import { buildSeekerTools } from "../../../services/assistant/tools";

// Allow streaming responses up to 30s.
export const maxDuration = 30;

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

  const body = (await req.json()) as { messages: UIMessage[]; context?: unknown };
  const messages = body.messages;
  const context = normalizeContext(body.context);
  const token = await getToken({ template: "supabase" });
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
        system: hostSystemPrompt({
          hostName: hostProfile.hostName,
          companyName: hostProfile.companyName,
        }),
        messages: await convertToModelMessages(messages),
        tools: token ? buildHostTools({ token, userId }) : {},
        stopWhen: stepCountIs(5),
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
    system: seekerSystemPrompt({
      seekerName: profile?.displayName ?? null,
      onboardingComplete: profile?.onboardingComplete ?? false,
    }),
    messages: await convertToModelMessages(messages),
    // Identity is closed over inside the tools; the model cannot act as anyone
    // but this seeker. No token → no tools (the model can still converse).
    tools: token ? buildSeekerTools({ token, userId }) : {},
    // Bound tool-loop for cost + runaway control.
    stopWhen: stepCountIs(5),
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
