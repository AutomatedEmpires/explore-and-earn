/**
 * Editorial / "E&E blog" content source.
 *
 * Authored, low-churn editorial content — guides and field notes that reinforce
 * the HOUSING / MEALS / PAY triad and help seekers read an opportunity honestly.
 * This is a curated static source (not a CMS): the copy is real, version-pinned,
 * and shared by the public `/blog` routes AND the community Feed, so there is a
 * single source of truth and no fabricated DB rows. When a real CMS lands, swap
 * `EDITORIAL_POSTS` for a query — the `EditorialPost` shape is the contract.
 */

export type EditorialTone = "farm" | "maritime" | "remote" | "seasonal";
export type EditorialKind = "Guide" | "Field notes" | "Playbook";

export interface EditorialBlock {
  /** Optional section heading; omit for a lead/standalone paragraph group. */
  readonly heading?: string;
  readonly paragraphs: readonly string[];
}

export interface EditorialPost {
  readonly slug: string;
  readonly title: string;
  /** One-sentence teaser used on cards and in <meta description>. */
  readonly excerpt: string;
  readonly kind: EditorialKind;
  /** Drives the hero plate accent — no image binaries in the repo. */
  readonly tone: EditorialTone;
  readonly readMinutes: number;
  /** ISO yyyy-mm-dd — absolute, never relative. */
  readonly publishedAt: string;
  readonly author: string;
  readonly body: readonly EditorialBlock[];
}

export const EDITORIAL_POSTS: readonly EditorialPost[] = [
  {
    slug: "what-housing-included-actually-means",
    title: "What “Housing Included” Actually Means",
    excerpt:
      "Two listings can both say “housing included” and mean wildly different things. Here's how to read the fine print before you pack.",
    kind: "Guide",
    tone: "seasonal",
    readMinutes: 4,
    publishedAt: "2026-06-15",
    author: "Explore & Earn",
    body: [
      {
        paragraphs: [
          "On Explore & Earn, every opportunity has to answer three questions up front: where will you sleep, what will you eat, and what will you earn. Housing is the one people skim — and it's the one that quietly decides whether a season pays off.",
          "“Housing included” is a promise, not a spec. Before you commit, turn it into specifics.",
        ],
      },
      {
        heading: "The five questions that matter",
        paragraphs: [
          "Private room or shared? A bunk in a shared cabin is a very different season than your own door.",
          "Is it free, or deducted from pay? “Included” sometimes means “available, at a cost.” A listing should say which — and our hosts disclose it.",
          "How far is it from the work? On-site, a short shuttle, or a 40-minute drive you're expected to make at 5am?",
          "What's actually in it — heat, hot water, a kitchen, laundry, reliable signal? Seasonal housing ranges from a renovated lodge room to a tent platform.",
          "Who else is in the space, and what are the quiet hours? You're choosing roommates as much as a roof.",
        ],
      },
      {
        heading: "Why we make hosts say it out loud",
        paragraphs: [
          "Most job boards bury housing in a sentence at the bottom. We make it a first-class field because the value of a season is what you keep, not just what you're paid. A slightly lower wage with real housing usually beats a higher one where rent eats the difference.",
          "When you open a listing, use the TrueValue tool: put in what rent and groceries would cost you back home, and see what the offer is actually worth once housing and meals are covered. That number is the honest one.",
        ],
      },
    ],
  },
  {
    slug: "reading-a-seasonal-pay-offer",
    title: "Reading a Seasonal Pay Offer Without Getting Burned",
    excerpt:
      "Hourly, stipend, tips, piece-rate, end-of-season bonus — seasonal pay comes in shapes a normal paycheck doesn't. A field guide.",
    kind: "Playbook",
    tone: "remote",
    readMinutes: 5,
    publishedAt: "2026-06-08",
    author: "Explore & Earn",
    body: [
      {
        paragraphs: [
          "Seasonal pay rarely arrives as one clean number. It's a structure — and the structure is where a great offer and a thin one start to look the same on the surface.",
        ],
      },
      {
        heading: "Know which shape you're being offered",
        paragraphs: [
          "Hourly with a guaranteed minimum is the most legible: you know your floor. Ask whether overtime is real or whether hours get capped at 39.",
          "Stipend or day-rate flattens a long day into one figure. Divide it by the hours you'll actually work — a generous-looking stipend over a 12-hour day can land below the hourly job next to it.",
          "Tips and piece-rate scale with the season and your speed. Ask the host what a typical week looked like last year, not the best week anyone ever had.",
          "End-of-season bonuses reward finishing. They're real money, but only if you'd stay the whole season anyway — never let a bonus talk you into a season you'd otherwise leave.",
        ],
      },
      {
        heading: "Run the keep-rate, not the rate",
        paragraphs: [
          "The number that matters is what survives to your savings. Start from gross pay, then add back the rent and groceries you're not paying because housing and meals are covered, and subtract what you'll spend getting to and living at the site.",
          "A $16/hour role with housing, meals, and a free shuttle usually keeps more than a $22/hour role where you're renting a room and driving an hour each way. Do that math before the season, not after.",
        ],
      },
    ],
  },
  {
    slug: "a-season-at-sea-maritime-work-honestly",
    title: "A Season at Sea: Maritime Work, Honestly",
    excerpt:
      "Deckhand, dock crew, galley, tender driver — what maritime seasons ask of you, and what they give back.",
    kind: "Field notes",
    tone: "maritime",
    readMinutes: 6,
    publishedAt: "2026-05-28",
    author: "Explore & Earn",
    body: [
      {
        paragraphs: [
          "Maritime work has a romance to it — and a reality. Both are true. If you go in clear-eyed, a season on the water is one of the best trades a body of work can make.",
        ],
      },
      {
        heading: "What the days actually look like",
        paragraphs: [
          "Early starts are not optional; weather sets the schedule, not the calendar. You'll work split shifts around tides and trips, and a “slow day” still means lines, gear, and a clean boat.",
          "The work is physical and wet. Good rain gear and boots are the difference between a hard day and a miserable one — ask the host what's provided and what you bring.",
          "It's also deeply social. You live and work with the same small crew, which is the best and hardest part. Crews that eat together stay together.",
        ],
      },
      {
        heading: "What to confirm before you sign on",
        paragraphs: [
          "Where you sleep: bunk aboard, crew house ashore, or your own arrangement. On-water housing is common but tight — know what you're getting.",
          "How you're paid: hourly, by the trip, or a share of the catch. Shares can be excellent and can be lean; ask for last season's range.",
          "Certifications: some roles want a TWIC card, a boater safety course, or a food handler's card. A good host tells you up front and often helps you get there.",
        ],
      },
    ],
  },
  {
    slug: "farm-seasons-decoded",
    title: "Farm Seasons, Decoded",
    excerpt:
      "Planting, harvest, pack house, animal care — farm work runs on cycles. Match your season to the rhythm you want.",
    kind: "Guide",
    tone: "farm",
    readMinutes: 4,
    publishedAt: "2026-05-19",
    author: "Explore & Earn",
    body: [
      {
        paragraphs: [
          "“Farm work” is a dozen different seasons wearing the same word. The one you want depends on whether you'd rather start something, finish it, or keep it alive.",
        ],
      },
      {
        heading: "The rhythms",
        paragraphs: [
          "Planting seasons are hopeful and steady — long days getting a crop in the ground, with a clear arc and a quieter pace once it's done.",
          "Harvest is the sprint: intense, weather-driven, often the best-paid window because the work is time-critical. If you like a hard, finite push with a real payoff, this is it.",
          "Pack house and processing work is the indoor counterpart — steadier hours, less weather, repetitive but predictable.",
          "Animal care doesn't have an off-switch. It's twice-a-day, every day, including the day it snows. Deeply rewarding for the right person, relentless for the wrong one.",
        ],
      },
      {
        heading: "What a good farm provides",
        paragraphs: [
          "The best farm seasons cover housing on or near the land and feed you from what's grown there — that's the triad working in your favor. Confirm whether meals are daily and provided or “help yourself to the seconds,” because those are not the same deal.",
          "Ask about the team and the housing in the same breath. A bunkhouse with good people is a season you'll talk about for years; the same bunkhouse with the wrong fit is a long month.",
        ],
      },
    ],
  },
];

/** All posts, newest first. */
export function getEditorialPosts(): readonly EditorialPost[] {
  return [...EDITORIAL_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

/** A single post by slug, or undefined if it doesn't exist. */
export function getEditorialPost(slug: string): EditorialPost | undefined {
  return EDITORIAL_POSTS.find((post) => post.slug === slug);
}
