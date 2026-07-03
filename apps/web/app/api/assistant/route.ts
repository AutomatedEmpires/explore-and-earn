import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { auth } from "@clerk/nextjs/server";
import { getSeekerProfile } from "@explore-and-earn/db";

import { logAssistantTurn } from "../../../services/assistant/persistence";
import { seekerSystemPrompt } from "../../../services/assistant/systemPrompt";
import { buildSeekerTools } from "../../../services/assistant/tools";

// Allow streaming responses up to 30s.
export const maxDuration = 30;

/**
 * Seeker AI assistant endpoint.
 *
 * Auth-gated (the assistant only ever acts as the authenticated seeker). The
 * model is routed through the Vercel AI Gateway via a plain "provider/model"
 * string, overridable with ASSISTANT_MODEL so the model can change without code.
 */
const MODEL = process.env.ASSISTANT_MODEL ?? "anthropic/claude-sonnet-4.5";

export async function POST(req: Request): Promise<Response> {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Defense-in-depth degrade: the /assistant page already renders a "not
  // available" state when no gateway key is configured, so this guard is only
  // reached by a direct call in an unconfigured environment.
  if (!process.env.AI_GATEWAY_API_KEY) {
    return new Response("Assistant is not configured.", { status: 503 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const token = await getToken({ template: "supabase" });
  const profile = token ? await getSeekerProfile(token, userId) : null;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

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
