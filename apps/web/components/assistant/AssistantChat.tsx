"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DiscoveryCard, Icon } from "@explore-and-earn/ui";

import { DISCOVERY_FIXTURES, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import { byMonetization, type HostTier } from "../../lib/ranking";
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
  "Show me a listing in Alaska on a boat in 3 months",
  "Remote work that pays at least $20/hr",
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

// ─── Deterministic NL → filters parser ──────────────────────────────────────
//
// The founder wants a seeker to type "help me find a listing in Alaska on a boat
// in 3 months" and get RELATIVE, RANKED listings they can open — WITHOUT a model
// round-trip. This is a small keyword/regex parser (no new model call): it maps a
// free-text message onto the same filter shape the /seek page reads
// (q · category · location · start_range · housing · meals · pay_min) and, when a
// concrete search signal is present, ranks the app's discovery listings by
// monetization (Boosted > Enterprise > Match ≥90 > Professional > Starter) with
// relevance to the parsed intent as the tie-break. Never fabricates data — draws
// from DISCOVERY_FIXTURES, the same client-side discovery source the app already
// uses on the fixture path.

type Lane = DiscoveryListing["category"];

/** Category keyword lexicon. Order is the tie-break when hit-counts are equal. */
const LANE_KEYWORDS: ReadonlyArray<readonly [Lane, readonly string[]]> = [
  [
    "maritime",
    ["boat", "ship", "vessel", "deckhand", "deck hand", "fishing", "fisher", "fisheries", "salmon", "ocean", "sea ", "at sea", "maritime", "marine", "sailing", "sail", "yacht", "crew", "harbor", "harbour", "dock", "fleet", "trawler"],
  ],
  [
    "farm",
    ["farm", "orchard", "harvest", "vineyard", "ranch", "agricultur", "crop", "picking", "cellar", "vine", "cattle", "livestock", "grape", "apple", "produce"],
  ],
  [
    "seasonal",
    ["ski", "snow", "resort", "winter", "summer camp", "camp ", "lodge", "hospitality", "hotel", "seasonal", "mountain", "slope", "front desk", "chalet"],
  ],
  [
    "remote",
    ["remote", "wfh", "work from home", "online", "digital", "virtual", "anywhere", "laptop"],
  ],
  [
    "mix",
    ["hostel", "eco-hostel", "backpacker", "allrounder", "all-rounder", "guesthouse"],
  ],
];

/** Places we can recognise: US states + a few countries/cities from the catalog. */
const LOCATIONS: ReadonlyArray<readonly [string, string]> = [
  ["alabama", "Alabama"], ["alaska", "Alaska"], ["arizona", "Arizona"], ["arkansas", "Arkansas"],
  ["california", "California"], ["colorado", "Colorado"], ["connecticut", "Connecticut"], ["delaware", "Delaware"],
  ["florida", "Florida"], ["georgia", "Georgia"], ["hawaii", "Hawaii"], ["idaho", "Idaho"],
  ["illinois", "Illinois"], ["indiana", "Indiana"], ["iowa", "Iowa"], ["kansas", "Kansas"],
  ["kentucky", "Kentucky"], ["louisiana", "Louisiana"], ["maine", "Maine"], ["maryland", "Maryland"],
  ["massachusetts", "Massachusetts"], ["michigan", "Michigan"], ["minnesota", "Minnesota"], ["mississippi", "Mississippi"],
  ["missouri", "Missouri"], ["montana", "Montana"], ["nebraska", "Nebraska"], ["nevada", "Nevada"],
  ["new hampshire", "New Hampshire"], ["new jersey", "New Jersey"], ["new mexico", "New Mexico"], ["new york", "New York"],
  ["north carolina", "North Carolina"], ["north dakota", "North Dakota"], ["ohio", "Ohio"], ["oklahoma", "Oklahoma"],
  ["oregon", "Oregon"], ["pennsylvania", "Pennsylvania"], ["rhode island", "Rhode Island"], ["south carolina", "South Carolina"],
  ["south dakota", "South Dakota"], ["tennessee", "Tennessee"], ["texas", "Texas"], ["utah", "Utah"],
  ["vermont", "Vermont"], ["virginia", "Virginia"], ["washington", "Washington"], ["west virginia", "West Virginia"],
  ["wisconsin", "Wisconsin"], ["wyoming", "Wyoming"],
  ["portugal", "Portugal"], ["spain", "Spain"], ["france", "France"], ["italy", "Italy"],
  ["mexico", "Mexico"], ["canada", "Canada"], ["australia", "Australia"], ["new zealand", "New Zealand"], ["thailand", "Thailand"],
  ["wenatchee", "Wenatchee"], ["sitka", "Sitka"], ["breckenridge", "Breckenridge"], ["napa", "Napa"], ["lisbon", "Lisbon"],
];

const STOPWORDS = new Set([
  "find", "help", "show", "looking", "search", "want", "need", "like", "please", "list",
  "listing", "listings", "opportunity", "opportunities", "job", "jobs", "work", "gig", "role",
  "position", "hiring", "with", "that", "this", "have", "would", "about", "some", "months",
  "month", "weeks", "week", "near", "around", "somewhere", "place", "there", "them", "from",
  "into", "over", "under", "least", "minimum", "pays", "paying", "make", "making", "earn",
]);

export interface ParsedSearch {
  readonly category?: Lane;
  readonly location?: string;
  readonly startRange?: 1 | 3 | 6;
  readonly housing?: boolean;
  readonly meals?: boolean;
  /** Minimum pay in whole dollars, when detected. */
  readonly payMin?: number;
  /** Ranked listings for this intent (never fabricated). */
  readonly results: readonly DiscoveryListing[];
  /** True when nothing scored above 0 and we fell back to closest opportunities. */
  readonly fallback: boolean;
}

function detectLane(text: string): Lane | undefined {
  let best: Lane | undefined;
  let bestHits = 0;
  for (const [lane, words] of LANE_KEYWORDS) {
    let hits = 0;
    for (const w of words) if (text.includes(w)) hits += 1;
    if (hits > bestHits) {
      bestHits = hits;
      best = lane;
    }
  }
  return best;
}

function detectLocation(text: string): string | undefined {
  // Longest needle first so "new york" beats "york"-style partials.
  let match: string | undefined;
  let matchLen = 0;
  for (const [needle, display] of LOCATIONS) {
    if (text.includes(needle) && needle.length > matchLen) {
      match = display;
      matchLen = needle.length;
    }
  }
  return match;
}

function detectStartRange(text: string): 1 | 3 | 6 | undefined {
  const m = text.match(/(\d+)\s*(?:months?|mos?)\b/);
  if (m) {
    const n = Number(m[1]);
    return n <= 1 ? 1 : n <= 3 ? 3 : 6;
  }
  if (/\b(?:next month|a month|this month|weeks?\b|asap|right away|soon)\b/.test(text)) return 1;
  return undefined;
}

function detectPayMin(text: string): number | undefined {
  const patterns = [
    /\$\s*(\d{1,4})/,
    /(\d{1,4})\s*(?:\/|\s)?(?:hr|hour|hourly|day|daily|per hour|per day)\b/,
    /(?:at least|minimum|min|over|above|earn(?:ing)?|pay(?:ing)?|wage of|around)\s*\$?\s*(\d{1,4})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function keywordTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
    ),
  );
}

function listingHaystack(l: DiscoveryListing): string {
  return [
    l.title,
    l.host.name,
    l.location,
    l.benefits.housing.summary ?? "",
    l.benefits.meals.summary ?? "",
    l.benefits.pay.summary ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

interface Intent {
  readonly category?: Lane;
  readonly location?: string;
  readonly startRange?: 1 | 3 | 6;
  readonly housing?: boolean;
  readonly meals?: boolean;
  readonly payMin?: number;
  readonly keywords: readonly string[];
}

function relevance(l: DiscoveryListing, intent: Intent): number {
  let s = 0;
  if (intent.category && l.category === intent.category) s += 3;
  if (intent.location && l.location.toLowerCase().includes(intent.location.toLowerCase())) s += 3;
  if (intent.housing && l.benefits.housing.provision !== "not_provided") s += 1;
  if (intent.meals && l.benefits.meals.provision !== "not_provided") s += 1;
  if (intent.payMin != null) {
    const min = l.payInsight?.minCents;
    if (min != null && min >= intent.payMin * 100) s += 1;
  }
  if (intent.startRange && beginsWithin(l, intent.startRange)) s += 1;
  if (intent.keywords.length > 0) {
    const hay = listingHaystack(l);
    for (const kw of intent.keywords) if (hay.includes(kw)) s += 1;
  }
  return s;
}

/** Mirrors /seek's begins-window check (deterministic, client-side). */
function beginsWithin(l: DiscoveryListing, months: 1 | 3 | 6): boolean {
  if (!l.begins) return false;
  const begins = new Date(l.begins);
  if (Number.isNaN(begins.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + months);
  return begins >= now && begins <= cutoff;
}

function monetizationInputs(l: DiscoveryListing) {
  return {
    boosted: (l.conditionalBadges ?? []).includes("boosted"),
    hostTier: (l.host.tier ?? "none") as HostTier,
    matchScore: l.matchScore,
  };
}

const MAX_RESULTS = 4;

/**
 * Parse a free-text message into a ranked search, or null when there is no
 * concrete search signal (so ordinary conversation is left to the model).
 */
export function parseSearchIntent(message: string): ParsedSearch | null {
  const text = ` ${message.toLowerCase()} `;
  const category = detectLane(text);
  const location = detectLocation(text);
  const startRange = detectStartRange(text);
  const wantsHousing = /\b(housing|accommodation|accommodations|lodging|room and board|somewhere to (?:stay|live)|place to stay)\b/.test(text)
    ? true
    : undefined;
  const wantsMeals = /\b(meals?|food included|full board|room and board|meal plan|fed\b|breakfast|lunch|dinner)\b/.test(text)
    ? true
    : undefined;
  const payMin = detectPayMin(text);

  // A search needs at least one concrete filter — a bare "which fits me best?"
  // has none, and is left to the conversational model.
  const hasSignal =
    category != null ||
    location != null ||
    startRange != null ||
    wantsHousing != null ||
    wantsMeals != null ||
    payMin != null;
  if (!hasSignal) return null;

  const intent: Intent = {
    category,
    location,
    startRange,
    housing: wantsHousing,
    meals: wantsMeals,
    payMin,
    keywords: keywordTokens(message.toLowerCase()),
  };

  const scored = DISCOVERY_FIXTURES.map((l) => ({ l, score: relevance(l, intent) }));
  const relevant = scored.filter((x) => x.score > 0);
  const fallback = relevant.length === 0;
  const pool = fallback ? scored : relevant;

  // Relevance as the baseline order, then monetization as the PRIMARY sort —
  // Array.sort is stable, so equal-monetization listings keep relevance order.
  const ranked = [...pool]
    .sort((a, b) => b.score - a.score)
    .map((x) => x.l)
    .sort(byMonetization<DiscoveryListing>((l) => monetizationInputs(l)))
    .slice(0, MAX_RESULTS);

  return {
    category,
    location,
    startRange,
    housing: wantsHousing,
    meals: wantsMeals,
    payMin,
    results: ranked,
    fallback,
  };
}

/** Deep-link to /seek carrying the parsed filters the seek page reads. */
function buildSeekHref(parsed: ParsedSearch): string {
  const sp = new URLSearchParams();
  if (parsed.category) sp.set("category", parsed.category);
  if (parsed.location) sp.set("location", parsed.location);
  if (parsed.startRange) sp.set("start_range", String(parsed.startRange));
  if (parsed.housing) sp.set("housing", "1");
  if (parsed.meals) sp.set("meals", "1");
  if (parsed.payMin != null) sp.set("pay_min", String(parsed.payMin));
  const qs = sp.toString();
  return qs ? `/seek?${qs}` : "/seek";
}

const LANE_LABEL: Record<Lane, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

/** Transparent "here's what I understood" chips — honest, minimal helper text. */
function parsedChips(parsed: ParsedSearch): string[] {
  const chips: string[] = [];
  if (parsed.category) chips.push(LANE_LABEL[parsed.category]);
  if (parsed.location) chips.push(parsed.location);
  if (parsed.startRange) chips.push(`Within ${parsed.startRange} mo`);
  if (parsed.housing) chips.push("Housing");
  if (parsed.meals) chips.push("Meals");
  if (parsed.payMin != null) chips.push(`$${parsed.payMin}+ pay`);
  return chips;
}

/**
 * Inline ranked-results block. Additive to the conversation — the model still
 * replies in prose; this is a deterministic discovery affordance rendered under
 * the seeker's search message. Cards are the LOCKED DiscoveryCard; opening any
 * of them (title, category, or the View CTA) routes to /listing/{id}.
 */
function SearchResultsBlock({
  parsed,
  onOpen,
}: {
  readonly parsed: ParsedSearch;
  readonly onOpen: (id: string) => void;
}) {
  if (parsed.results.length === 0) return null;
  const chips = parsedChips(parsed);
  return (
    <div className={styles.results} aria-label="Matching listings">
      <div className={styles.resultsHead}>
        <span className={styles.resultsTitle}>
          <Icon name="nav.map" size={16} aria-hidden />
          {parsed.fallback ? "Closest opportunities" : "Matching listings"}
        </span>
        {chips.length > 0 ? (
          <span className={styles.parsedChips}>
            {chips.map((c) => (
              <span key={c} className={styles.parsedChip}>
                {c}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <div className={styles.resultsGrid}>
        {parsed.results.map((listing) => (
          <DiscoveryCard
            key={listing.id}
            data={toDiscoveryCardData(listing)}
            surface="discovery_feed"
            onOpen={onOpen}
            actions={
              <button
                type="button"
                className={styles.resultOpen}
                onClick={() => onOpen(listing.id)}
              >
                <Icon name="action.apply" size={16} aria-hidden />
                View listing
                <Icon name="action.forward" size={16} aria-hidden />
              </button>
            }
          />
        ))}
      </div>

      <Link className={styles.resultsMore} href={buildSeekHref(parsed)}>
        See all in Seek
        <Icon name="action.forward" size={16} aria-hidden />
      </Link>
    </div>
  );
}

/** Join a message's text parts into a single string for parsing/keying. */
function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? (part as { text: string }).text : ""))
    .join("")
    .trim();
}

/**
 * Assistant chat panel — one component, context-aware. Streams from
 * /api/assistant with auth-scoped tools; the `context` prop selects the
 * persona. The latest persisted thread resumes; find_opportunities results
 * render as clickable listing cards (the assistant is a discovery surface,
 * not a text describer). A deterministic NL parser ALSO renders a ranked
 * results block under any search-style message — so "a listing in Alaska on a
 * boat in 3 months" surfaces openable listings even without a model round-trip.
 * Premium, borders-first, token-driven.
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
  const router = useRouter();
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant", body: { context, page } }),
    messages: (initialMessages ?? []) as unknown as UIMessage[],
  });
  const [input, setInput] = useState("");
  // Deterministic parses keyed by normalized message text. Non-search messages
  // map to null so we don't re-parse them on every render.
  const [searches, setSearches] = useState<Map<string, ParsedSearch | null>>(new Map());
  const busy = status === "submitted" || status === "streaming";
  const endRef = useRef<HTMLDivElement>(null);

  const openListing = useMemo(
    () => (id: string) => router.push(`/listing/${id}`),
    [router],
  );

  // Keep the newest turn in view as it streams (respect reduced motion).
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const key = trimmed.toLowerCase();
    setSearches((prev) => {
      if (prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, parseSearchIntent(trimmed));
      return next;
    });
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

        {messages.map((message) => {
          const parsed =
            message.role === "user"
              ? searches.get(messageText(message).toLowerCase()) ?? null
              : null;
          return (
            <div key={message.id}>
              <div
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
              {parsed ? <SearchResultsBlock parsed={parsed} onOpen={openListing} /> : null}
            </div>
          );
        })}

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
