import {
  MARKETPLACE_LANES,
  type CompensationUnit,
  type MarketplaceCategory,
  type MarketplaceLane,
} from "@explore-and-earn/contracts";
import type { PublicHostListing, PublicHostProfile } from "@explore-and-earn/db";

/**
 * The onboarding draft, and the honest things that can be said about it.
 *
 * WHY A PLAIN .ts MODULE. This app compiles JSX with `jsx: "preserve"`, so
 * vitest cannot transform a .tsx — anything asserted about what the wizard
 * DECIDES has to live outside the component to be testable at all. The same
 * reason components/host/publicListingCardModel.ts exists.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EVERY FIELD HERE HAS A REAL PLACE TO GO. That is a deliberate constraint and
 * it decided the shape of the whole wizard.
 *
 * The redesign brief asked for a company-identity step carrying industry, head
 * count and hiring volume, and a story step carrying transport, gear, bonuses,
 * schedule, accessibility and certifications. `host_profiles` has columns for
 * none of those, and this program exists because the product promised things it
 * did not do — so a field that saves nowhere is the exact defect being fixed,
 * not a shortcut around it. What happened to each:
 *
 *   industry        → categoryScopes. The four marketplace lanes ARE this
 *                     product's industry taxonomy; a second free-text one would
 *                     be a filter nobody can search on.
 *   description     → about, plus tagline for the one-line version.
 *   logo            → photo_url, uploaded through uploadHostLogoAction.
 *   cover           → the FIRST ROLE'S cover photo. The public profile derives
 *                     its cover band from exactly that (see the /host/[id]
 *                     page), so the cover is captured on the role step where it
 *                     genuinely lives rather than as a profile field that would
 *                     be discarded on save.
 *   housing / meals → housing_offered_generally / meals_offered_generally at
 *                     the employer level, and the per-role descriptions on the
 *                     role itself.
 *   schedule, transport, gear, bonuses, certifications, accessibility
 *                   → these belong to a ROLE, not to an employer: they differ
 *                     between the dock crew and the kitchen. They are captured
 *                     in the listing composer, and the story step says so and
 *                     links there instead of collecting them twice.
 *   head count, hiring volume
 *                   → NOT COLLECTED. There is no column, no filter, and no
 *                     surface that would show them. Asking for them would be a
 *                     form field whose only effect is to make onboarding longer.
 *
 * If a migration later adds any of these, the field joins this type and the
 * gap list below; until then nothing in the wizard pretends to store one.
 */

/** A marketplace lane the wizard can offer. Re-exported for the wizard's UI. */
export const ONBOARDING_LANES: readonly MarketplaceLane[] = MARKETPLACE_LANES;

export interface HostOnboardingDraft {
  /* ── Company identity ─────────────────────────────────────────────── */
  readonly companyName: string;
  readonly lanes: readonly MarketplaceLane[];
  readonly primaryLocationName: string;
  readonly websiteUrl: string;
  readonly logoUrl: string | null;
  /* ── Employer story & candidate experience ────────────────────────── */
  readonly tagline: string;
  readonly about: string;
  readonly housingOffered: boolean;
  readonly mealsOffered: boolean;
  /* ── First role draft ─────────────────────────────────────────────── */
  readonly roleTitle: string;
  readonly roleCategory: MarketplaceLane | "";
  readonly roleSummary: string;
  readonly rolePayMin: string;
  readonly rolePayMax: string;
  readonly rolePayPeriod: CompensationUnit;
  readonly roleStart: string;
  readonly roleEnd: string;
  readonly roleHousingIncluded: boolean;
  readonly roleMealsIncluded: boolean;
  readonly roleCoverUrl: string | null;
}

export const EMPTY_ONBOARDING_DRAFT: HostOnboardingDraft = {
  companyName: "",
  lanes: [],
  primaryLocationName: "",
  websiteUrl: "",
  logoUrl: null,
  tagline: "",
  about: "",
  housingOffered: false,
  mealsOffered: false,
  roleTitle: "",
  roleCategory: "",
  roleSummary: "",
  rolePayMin: "",
  rolePayMax: "",
  rolePayPeriod: "hour",
  roleStart: "",
  roleEnd: "",
  roleHousingIncluded: false,
  roleMealsIncluded: false,
  roleCoverUrl: null,
};

/**
 * An in-memory draft is safe to render only after Clerk has loaded and the
 * draft restored from storage belongs to that exact signed-in user. This gate
 * prevents an account switch from painting the previous host's answers while
 * the new account's restore effect is still pending.
 */
export function hostOnboardingDraftReady(
  authLoaded: boolean,
  userId: string | null | undefined,
  restoredForUserId: string | null,
): boolean {
  return Boolean(authLoaded && userId && restoredForUserId === userId);
}

/** A changed identity must remount the stateful wizard and abandon old callbacks. */
export function hostOnboardingIdentityKey(identity: string | null): string {
  return identity ?? "signed-out";
}

/* ── Steps ─────────────────────────────────────────────────────────────── */

export const ONBOARDING_STEPS = [
  "welcome",
  "identity",
  "story",
  "preview",
  "role",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStepMeta {
  readonly id: OnboardingStep;
  readonly label: string;
  /** Short statement of what the host leaves this step with. */
  readonly outcome: string;
}

export const ONBOARDING_STEP_META: readonly OnboardingStepMeta[] = [
  {
    id: "welcome",
    label: "Welcome",
    outcome: "See what a finished employer profile looks like",
  },
  {
    id: "identity",
    label: "Your company",
    outcome: "Name, lanes, location and logo — how seekers recognise you",
  },
  {
    id: "story",
    label: "Your story",
    outcome: "Why people come, and what they get while they are with you",
  },
  {
    id: "preview",
    label: "Seeker preview",
    outcome: "Your profile exactly as a seeker meets it",
  },
  {
    id: "role",
    label: "First role",
    outcome: "A saved draft role, ready to publish when you activate",
  },
];

export function stepIndexOf(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The identity step is the one that gates: a profile needs a name and a lane. */
export function canLeaveIdentityStep(draft: HostOnboardingDraft): boolean {
  return draft.companyName.trim().length > 0 && draft.lanes.length > 0;
}

/* ── Gaps: what is missing, said as guidance ───────────────────────────── */

export type GapArea = "identity" | "story" | "role";

export interface ProfileGap {
  readonly id: string;
  readonly area: GapArea;
  readonly label: string;
  /** What the host would gain, in their words — never a scolding. */
  readonly body: string;
}

/**
 * What this profile has not said yet.
 *
 * THE ALTERNATIVE WAS THE ABSENCE MARKER, AND IT IS WORSE HERE. Absence renders
 * as the not-stated label (contracts/provenance) on the public surfaces, and
 * that is right there: a seeker reading
 * a live listing must be able to tell silence from a no. But a host looking at
 * their OWN half-built profile is not being told about someone else's silence —
 * they are being told about their own, and the useful form of that is an
 * instruction, not a label. So the preview never renders the absence marker over
 * the host's own blanks; it names them here instead, with what filling them
 * does.
 *
 * NOTHING IS INVENTED TO COVER A GAP. A blank stays blank in the preview and
 * appears in this list; it is never given a placeholder value that would show
 * the host a profile they do not have.
 */
export function profileGaps(draft: HostOnboardingDraft): readonly ProfileGap[] {
  const gaps: ProfileGap[] = [];

  if (draft.primaryLocationName.trim() === "") {
    gaps.push({
      id: "location",
      area: "identity",
      label: "Where you are based",
      body: "Seekers filter and search by place, and the map only shows employers who have one.",
    });
  }
  if (!draft.logoUrl) {
    gaps.push({
      id: "logo",
      area: "identity",
      label: "A logo",
      body: "Your profile shows a placeholder mark until you add one.",
    });
  }
  if (draft.websiteUrl.trim() === "") {
    gaps.push({
      id: "website",
      area: "identity",
      label: "A website link",
      body: "One outside link is the fastest way for a seeker to check you are real.",
    });
  }
  if (draft.tagline.trim() === "") {
    gaps.push({
      id: "tagline",
      area: "story",
      label: "A one-line summary",
      body: "The line under your name — the first sentence anyone reads about you.",
    });
  }
  if (draft.about.trim() === "") {
    gaps.push({
      id: "about",
      area: "story",
      label: "Your story",
      body: "A few sentences on the season, the place and the crew. This is the section seekers spend longest on.",
    });
  }
  if (!draft.housingOffered && !draft.mealsOffered) {
    gaps.push({
      id: "benefits",
      area: "story",
      label: "Housing or meals",
      body: "If you provide either, saying so puts you in the filters seekers use most. If you provide neither, leave both off — an honest no beats a silence.",
    });
  }
  if (draft.roleTitle.trim() === "") {
    gaps.push({
      id: "role",
      area: "role",
      label: "Your first role",
      body: "An employer profile with no roles shows as having no openings. Drafting one costs nothing.",
    });
  }
  return gaps;
}

/* ── Preview models ────────────────────────────────────────────────────── */

/**
 * Build the PUBLIC profile shape from the draft, for the real seeker-facing
 * components.
 *
 * Blanks stay null rather than becoming a stand-in string: HostProfileHero
 * already omits every section whose value is null, so an unfinished profile
 * renders as a shorter profile — which is what it is — rather than as a full one
 * containing sentences the host never wrote.
 *
 * `verified` is FALSE and not negotiable here. Verification is derived from an
 * active paid subscription (contracts/card.ts); a preview that showed the badge
 * would be selling one.
 */
export function toPreviewHostProfile(
  draft: HostOnboardingDraft,
  hostProfileId: string,
): PublicHostProfile {
  const trimmed = (value: string) => {
    const next = value.trim();
    return next === "" ? null : next;
  };

  return {
    id: hostProfileId,
    companyName: draft.companyName.trim() || "Your organization",
    hostName: null,
    tagline: trimmed(draft.tagline),
    about: trimmed(draft.about),
    primaryLocationName: trimmed(draft.primaryLocationName),
    photoUrl: draft.logoUrl,
    websiteUrl: trimmed(draft.websiteUrl),
    socialLinks: {},
    categoryScopes: [...draft.lanes],
    housingOfferedGenerally: draft.housingOffered,
    mealsOfferedGenerally: draft.mealsOffered,
    verified: false,
    createdAt: null,
  };
}

/**
 * Is the role draft complete enough to render as a card?
 *
 * THE CARD IS GATED ON PAY, and that is the whole point of this function. The
 * public listing card derives its pay cell through formatCompensation, whose
 * fallback is the absence marker — so a role with no pay figure would render the
 * host's own preview with that marker printed across it. The redesign forbids
 * exactly that: the host's blanks are guidance, not labels. Below the bar, the
 * preview shows a placeholder that says what the card needs; it never renders a
 * card carrying an absence marker, and it never invents a figure to avoid one.
 */
export function roleCardReady(draft: HostOnboardingDraft): boolean {
  if (draft.roleTitle.trim() === "") return false;
  if (draft.roleCategory === "") return false;
  return payCents(draft.rolePayMin) != null || payCents(draft.rolePayMax) != null;
}

/** Parse a host-typed major-unit amount into integer cents. Money is cents. */
export function payCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** The draft role as the public host profile's own listing card renders it. */
export function toPreviewListing(
  draft: HostOnboardingDraft,
): PublicHostListing | null {
  if (!roleCardReady(draft)) return null;

  return {
    id: "onboarding-role-preview",
    title: draft.roleTitle.trim(),
    category: draft.roleCategory as MarketplaceCategory,
    coverPhotoUrl: draft.roleCoverUrl,
    locationDisplay: draft.primaryLocationName.trim() || null,
    latitude: null,
    longitude: null,
    housingIncluded: draft.roleHousingIncluded,
    mealsIncluded: draft.roleMealsIncluded,
    compensationSummary: null,
    compensationMinCents: payCents(draft.rolePayMin),
    compensationMaxCents: payCents(draft.rolePayMax),
    compensationUnit: draft.rolePayPeriod,
    compensationCurrency: "usd",
    publishedAt: null,
  };
}
