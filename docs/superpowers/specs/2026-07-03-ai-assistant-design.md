# Design — User-scoped AI Assistant (seeker MVP)

**Date:** 2026-07-03
**Branch:** `feat/ai-assistant` (stacked on `feat/matching-engine` — the assistant reads the match engine)
**Status:** Plan → implementing (founder-authorized)

## 1. Vision — a guide, not a chatbot

Explore&Earn already knows a seeker's profile, saved searches, applications, and — now — their **match scores**. A generic bolt-on chatbot ignores all of that. This assistant is a **scoped guide**: it can only see what *this* seeker can see, and it acts through the same typed services the app already trusts. It answers the questions a seeker actually asks on a lifestyle-work marketplace — *"which of these actually fits me,"* *"why is this a strong match,"* *"what's missing from my profile,"* *"where do my applications stand"* — grounded in real data via tools, never hallucinated.

**Defended tenets:**

1. **Permission-safe by construction.** The model never touches the database. Every tool is built server-side, **bound to the authenticated Clerk identity** (`auth().userId` + the Supabase-templated token), and calls the *same* RLS-scoped services the UI uses. The model cannot pass a different user id — identity is closed over at tool-construction time, not taken from tool arguments. This makes cross-user data leakage structurally impossible, not merely discouraged.
2. **Grounded, not guessing.** Recommendations come from tool results (`searchListings`, the match engine, the seeker's own applications/profile) — the model narrates real rows. The system prompt forbids inventing listings, pay, or match facts.
3. **Explains real matches.** `explain_match` runs the ADR-040 engine (this stack's new engine) and returns the band + top contributing components + any honesty caps — so "why is this a strong match" is answered from the same numbers the feed uses (G34: the model phrases them; nothing new is stored).
4. **Gateway-routed, model-agnostic, cost-aware.** Uses the Vercel AI Gateway with a plain `"provider/model"` string (configurable via `ASSISTANT_MODEL`), so the model can change without code and the gateway centralizes fallbacks/observability/cost. Streaming keeps it responsive.
5. **Degrades gracefully.** With no `AI_GATEWAY_API_KEY` (local/preview without AI configured), the endpoint returns a friendly "assistant isn't configured" message instead of crashing — matching how the app degrades without Clerk/PostHog.
6. **Auditable + persistent.** Threads and messages persist per-user (RLS-owned) for continuity and moderation/audit — but tool *results* the model saw are the trust boundary, not free text.

## 2. Architecture

```
supabase/migrations/053_assistant_threads.sql   — assistant_threads + assistant_messages + RLS
apps/web/services/assistant/
  tools.ts        — buildSeekerTools({ token, userId, seekerProfileId }) → auth-bound tool set
  systemPrompt.ts — seeker persona + guardrails, personalized from the profile
  persistence.ts  — load/append thread messages (service-role, owner-checked)
apps/web/app/api/assistant/route.ts             — POST: auth → streamText(tools) → UI message stream
apps/web/app/(seeker)/assistant/
  page.tsx        — server: gates auth, renders the client panel
  AssistantChat.tsx — "use client": useChat panel (premium, token-driven)
```

### 2.1 Tools (all seeker-scoped, read-only in MVP)
| Tool | Backs onto | Returns |
|---|---|---|
| `find_opportunities` | `searchListings` (public filters) | compact list (title, category, triad, pay, location) |
| `explain_match` | `computeMatch` (ADR-040 engine) | band, top reasons, caps — for one listing vs the seeker |
| `my_applications` | `getSeekerApplications` | the seeker's applications + statuses |
| `profile_tips` | `getSeekerProfile` | which profile fields are missing (drives completeness) |

Write actions (apply, message-send) are intentionally **out of MVP** — the assistant *drafts*, the human acts. No tool mutates marketplace state.

### 2.2 Route flow
1. `auth()` → `userId`; unauthenticated → 401.
2. No `AI_GATEWAY_API_KEY` → stream a single graceful "not configured" assistant message.
3. `getToken({template:'supabase'})` + load the seeker profile (persona context + `seekerProfileId` for tools).
4. `streamText({ model: ASSISTANT_MODEL, instructions: systemPrompt, messages: convertToModelMessages(messages), tools: buildSeekerTools(...) , stopWhen: stepCountIs(5) })`.
5. Persist the new user message + final assistant message to `assistant_messages`.
6. Return `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`.

### 2.3 Schema (053)
```
assistant_threads(id, seeker_profile_id, clerk_user_id, title, created_at, updated_at)
assistant_messages(id, thread_id, role text check in (user,assistant,system,tool),
                   parts jsonb, created_at)
```
RLS: owner-only (`seeker_profile_id in current_seeker_profile_ids()` for threads; messages via their thread's owner). Writes are service-role (the route persists). Additive/idempotent; applied by db-migrate on merge.

## 3. Safety
- **Identity closed over** in tool construction (never from model args).
- **Rate limiting** via the existing `lib/rateLimit` per user.
- **`stopWhen: stepCountIs(N)`** bounds tool loops (cost + runaway control), plus the gateway's own cost controls.
- **Grounding prompt**: never invent listings/pay/match facts; if a tool returns nothing, say so.
- **No monetization coupling** and no write tools in MVP.

## 4. Staging
- **MVP (this PR):** seeker persona, 4 read-only grounded tools, streaming UI, persistence, graceful degrade.
- **Stage 2:** host + admin personas; draft-and-review write flows (apply/message) with explicit human confirmation; `pgvector` RAG over listings/help; behavioral signals from `events`; "resume this thread".

## 5. Verification
typecheck, lint, build, guardrails, tests. Runtime LLM streaming is exercised once `AI_GATEWAY_API_KEY` + `ASSISTANT_MODEL` are set on a deploy (the endpoint degrades gracefully without them, so build/preview never depend on a key).
