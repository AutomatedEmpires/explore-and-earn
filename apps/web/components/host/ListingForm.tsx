"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";


import { Button, DiscoveryCard, Icon, type DiscoveryCardData, type IconKey } from "@explore-and-earn/ui";
import {
  uploadListingMedia,
  deleteListingMedia,
  LISTING_MEDIA_BUCKET,
} from "@explore-and-earn/db/client";
import {
  COMPENSATION_UNIT,
  NOT_STATED_LABEL,
  hasVerifiedHostSubscription,
  sanitizeConnectivity,
  sanitizeMaritimeDepth,
  statedFactsKey,
  type BenefitEvidenceStatus,
  type CompensationUnit,
  type ConnectivityInfo,
  type HostBenefitChoice,
  type MarketplaceCategory,
  type MaritimeDepth,
} from "@explore-and-earn/contracts";

import { ImageUpload } from "../ImageUpload";
import { BenefitTrustModal, type BenefitKind } from "../discovery";
import { ConnectivityFields } from "./ConnectivityFields";
import { MaritimeDepthFields } from "./MaritimeDepthFields";
import { MediaGalleryUpload, type GalleryItem } from "./MediaGalleryUpload";
import { createListingAction, updateListingAction } from "../../app/actions/listings";
import { monetizationRank, type HostTier } from "../../lib/ranking";
import { useOptionalGetToken } from "../../lib/useOptionalGetToken";
import styles from "./ListingForm.module.css";

/**
 * Retained for backwards compatibility with the host components barrel. The
 * create/edit form no longer renders a status toggle (status is owned by the
 * publish flow and create always starts as a draft), but the exported name is
 * kept so existing importers keep resolving.
 */
export type ListingFormStatus = "draft" | "active";

export interface ListingFormInitialValues {
  readonly title?: string;
  readonly category?: MarketplaceCategory;
  readonly locationName?: string;
  readonly housingDescription?: string;
  readonly mealsDescription?: string;
  /** Stored evidence + value, so an edit hydrates the host's real answer. */
  readonly housingEvidence?: BenefitEvidenceStatus;
  readonly housingIncluded?: boolean;
  readonly mealsEvidence?: BenefitEvidenceStatus;
  readonly mealsIncluded?: boolean;
  readonly payMin?: string;
  readonly payMax?: string;
  readonly payPeriod?: CompensationUnit;
  readonly summary?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly coverPhotoUrl?: string;
  readonly galleryUrls?: ReadonlyArray<string>;
  /** Host-stated connectivity (listings.logistics.connectivity; migration 068). */
  readonly connectivity?: ConnectivityInfo;
  /** Host-stated vessel depth (listings.category_depth.maritime; migration 069). */
  readonly maritime?: MaritimeDepth;
}

export interface ListingFormProps {
  readonly mode: "create" | "edit";
  /** Required in edit mode: the listing row id passed to updateListingAction. */
  readonly listingId?: string;
  readonly initial?: ListingFormInitialValues;
  /**
   * Owning host profile id. Required to enable the cover photo upload (uploads
   * go to listing-media/{hostProfileId}/cover); when absent the cover field is
   * hidden.
   */
  readonly hostProfileId?: string;
  /**
   * Host display + trust context, used ONLY to render the live seeker-facing
   * preview card (business name, logo, verified badge, feed placement). These
   * never change the submitted listing fields.
   */
  readonly hostName?: string;
  readonly hostAvatarUrl?: string;
  readonly hostSubscriptionTier?: "none" | "starter" | "professional" | "enterprise";
}

const PAY_PERIOD_LABEL: Record<CompensationUnit, string> = {
  hour: "Per hour",
  day: "Per day",
  week: "Per week",
  month: "Per month",
  year: "Per year",
  stipend: "Stipend",
  exchange: "Work exchange",
  other: "Other",
};

const PAY_SUFFIX: Record<CompensationUnit, string> = {
  hour: "/hr",
  day: "/day",
  week: "/wk",
  month: "/mo",
  year: "/yr",
  stipend: "",
  exchange: "",
  other: "",
};

/** The four browseable lanes. `mix` is emergent (2+ lanes) or chosen explicitly. */
const LANE_OPTIONS: ReadonlyArray<{ value: MarketplaceCategory; label: string; icon: IconKey }> = [
  { value: "farm", label: "Farm", icon: "category.farm" },
  { value: "maritime", label: "Maritime", icon: "category.maritime" },
  { value: "remote", label: "Remote", icon: "category.remote" },
  { value: "seasonal", label: "Seasonal", icon: "category.seasonal" },
];

type StepId = "basics" | "location" | "timing" | "offer" | "photos" | "story" | "review";

interface StepDef {
  readonly id: StepId;
  readonly name: string;
  readonly icon: IconKey;
  readonly required: boolean;
}

const STEPS: ReadonlyArray<StepDef> = [
  { id: "basics", name: "Basics", icon: "nav.host", required: true },
  { id: "location", name: "Location", icon: "mappin.location", required: false },
  { id: "timing", name: "Dates", icon: "status.begins", required: false },
  { id: "offer", name: "Housing · Meals · Pay", icon: "benefit.pay", required: true },
  { id: "photos", name: "Photos", icon: "nav.photos", required: false },
  { id: "story", name: "Story", icon: "action.edit", required: false },
  { id: "review", name: "Review", icon: "action.view", required: false },
];

/** The select's value: a host choice, or "" for the honest unanswered state. */
const UNCHOSEN = "";
type BenefitChoiceValue = HostBenefitChoice | typeof UNCHOSEN;

/**
 * The triad cell a seeker will read, given what the host has actually said.
 *
 * The description is only ever a flourish ON an answer — it is never the answer
 * itself, which is the distinction the old preview collapsed.
 */
function triadPreview(choice: BenefitChoiceValue, description: string): string {
  if (choice === UNCHOSEN) return NOT_STATED_LABEL;
  if (choice === "not_provided") return "Not included";
  return description.trim() || "Included";
}

/**
 * Seed a benefit select from what is STORED.
 *
 * Only a `confirmed` evidence means the host actually chose — `stated` is a
 * source's claim and `not_stated` is silence, and neither may be presented back
 * to the host as though they had answered. Anything else opens unanswered,
 * which is the truth and which publication will then require them to resolve.
 */
function choiceFromInitial(
  evidence: BenefitEvidenceStatus | undefined,
  included: boolean | undefined,
): BenefitChoiceValue {
  if (evidence !== "confirmed") return UNCHOSEN;
  return included ? "provided" : "not_provided";
}

/** Seed the lane multi-select from a single stored category (lossless for edit). */
function lanesFromCategory(category: MarketplaceCategory | undefined): MarketplaceCategory[] {
  if (!category) return [];
  return [category];
}

/** Collapse the multi-select back to the single stored category the action reads. */
function categoryFromLanes(lanes: readonly MarketplaceCategory[]): MarketplaceCategory | undefined {
  if (lanes.includes("mix")) return "mix";
  if (lanes.length >= 2) return "mix";
  if (lanes.length === 1) return lanes[0];
  return undefined;
}

function formatDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Build the card's Pay display string from the structured pay inputs. */
function formatPayDisplay(min: string, max: string, unit: CompensationUnit): string {
  if (unit === "exchange") return "Work exchange";
  const nMin = toNumber(min);
  const nMax = toNumber(max);
  const suffix = PAY_SUFFIX[unit];

  if (unit === "stipend") {
    if (nMin != null && nMax != null && nMin !== nMax) return `$${money(nMin)}–${money(nMax)} stipend`;
    if (nMin != null) return `$${money(nMin)} stipend`;
    if (nMax != null) return `$${money(nMax)} stipend`;
    return "Stipend";
  }

  if (nMin != null && nMax != null && nMin !== nMax) return `$${money(nMin)}–${money(nMax)}${suffix}`;
  if (nMin != null && nMax != null) return `$${money(nMin)}${suffix}`;
  if (nMin != null) return `From $${money(nMin)}${suffix}`;
  if (nMax != null) return `Up to $${money(nMax)}${suffix}`;
  return unit === "other" ? "Pay: see details" : "Pay TBD";
}

/**
 * Shared create/edit listing composer. A guided, save-draft-friendly wizard that
 * gathers the listing basics plus the Housing / Meals / Pay triad (product law —
 * never "Perks"; see AGENTS.md and packages/contracts/src/benefits.ts) and
 * submits to the listing server actions. A live, non-interactive DiscoveryCard
 * renders the seeker-facing card as the host types. Token-only styling.
 */
export function ListingForm({
  mode,
  listingId,
  initial,
  hostProfileId,
  hostName,
  hostAvatarUrl,
  hostSubscriptionTier,
}: ListingFormProps) {
  const router = useRouter();
  const getToken = useOptionalGetToken();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [showErrors, setShowErrors] = useState(false);

  const [coverPhotoUrl, setCoverPhotoUrl] = useState(initial?.coverPhotoUrl ?? "");
  const [galleryImages, setGalleryImages] = useState<ReadonlyArray<GalleryItem>>(() =>
    (initial?.galleryUrls ?? []).map((url, i) => ({
      id: `gallery-${i}`,
      url,
      bucket: "cover_photo" as const,
    })),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [lanes, setLanes] = useState<ReadonlyArray<MarketplaceCategory>>(() =>
    lanesFromCategory(initial?.category),
  );
  const [locationName, setLocationName] = useState(initial?.locationName ?? "");
  const [connectivity, setConnectivity] = useState<ConnectivityInfo>(
    initial?.connectivity ?? {},
  );
  // Hydrated UNCONDITIONALLY, regardless of the listing's current lane. The
  // fields only RENDER for a maritime listing, but the state must round-trip
  // for every listing: if a host re-lanes a boat listing to farm and saves,
  // un-hydrated state would submit `{}` and silently wipe vessel facts they
  // never touched. (See the render gate below — they stay editable too, so the
  // facts are never stranded.)
  const [maritime, setMaritime] = useState<MaritimeDepth>(initial?.maritime ?? {});
  // The host's explicit benefit decisions. UNCHOSEN ("") is a real state — the
  // host has the control in front of them and has not answered — and it must
  // survive all the way to the writer as `not_stated` rather than being
  // collapsed into a no. An edit hydrates from the stored evidence: only a
  // confirmed choice seeds a selection, so a listing that was never answered
  // opens unanswered rather than pre-filled with a guess.
  const [housingProvision, setHousingProvision] = useState<BenefitChoiceValue>(
    () => choiceFromInitial(initial?.housingEvidence, initial?.housingIncluded),
  );
  const [mealsProvision, setMealsProvision] = useState<BenefitChoiceValue>(
    () => choiceFromInitial(initial?.mealsEvidence, initial?.mealsIncluded),
  );
  const [housingDescription, setHousingDescription] = useState(
    initial?.housingDescription ?? "",
  );
  const [mealsDescription, setMealsDescription] = useState(
    initial?.mealsDescription ?? "",
  );
  const [payMin, setPayMin] = useState(initial?.payMin ?? "");
  const [payMax, setPayMax] = useState(initial?.payMax ?? "");
  const [payPeriod, setPayPeriod] = useState<CompensationUnit>(
    initial?.payPeriod ?? "hour",
  );
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  // The structured benefit editor (photos + amenities) only works once a listing
  // exists to attach uploads to — offered in edit mode alongside the free-text.
  const [benefitKind, setBenefitKind] = useState<BenefitKind | null>(null);
  const canEditBenefits = mode === "edit" && Boolean(listingId);

  const submitLabel = mode === "create" ? "Create listing" : "Save changes";
  const cancelHref = listingId ? `/host/listings/${listingId}` : "/host/listings";

  const derivedCategory = categoryFromLanes(lanes);
  const multiLane = !lanes.includes("mix") && lanes.length >= 2;

  // Ask the vessel questions of a maritime listing — or of any listing that
  // already carries vessel facts, so a host who re-lanes can still clear what
  // they stated rather than leaving it stranded and rendered.
  const hasMaritimeFacts = sanitizeMaritimeDepth(maritime) !== undefined;
  const showMaritimeFields = derivedCategory === "maritime" || hasMaritimeFacts;

  // ── Validation ────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const next: Partial<Record<string, string>> = {};
    if (title.trim().length === 0) next.title = "Give your listing a title.";
    if (!derivedCategory) next.lanes = "Pick at least one lane so seekers can find you.";
    if (startDate && endDate && endDate < startDate) {
      next.endDate = "The end date is before the start date.";
    }
    const nMin = toNumber(payMin);
    const nMax = toNumber(payMax);
    if (nMin != null && nMax != null && nMax < nMin) {
      next.payMax = "Max pay is lower than min pay.";
    }
    return next;
  }, [title, derivedCategory, startDate, endDate, payMin, payMax]);

  const stepFieldMap: Record<StepId, readonly string[]> = {
    basics: ["title", "lanes"],
    location: [],
    timing: ["endDate"],
    offer: ["payMax"],
    photos: [],
    story: [],
    review: [],
  };

  function fieldError(name: string): string | undefined {
    if (!showErrors && !touched.has(name)) return undefined;
    return errors[name];
  }

  function markTouched(name: string) {
    setTouched((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  }

  function stepHasBlockingError(id: StepId): boolean {
    return stepFieldMap[id].some((f) => Boolean(errors[f]));
  }

  function toggleLane(value: MarketplaceCategory) {
    markTouched("lanes");
    setLanes((prev) => {
      if (value === "mix") {
        return prev.includes("mix") ? [] : ["mix"];
      }
      const withoutMix = prev.filter((l) => l !== "mix");
      return withoutMix.includes(value)
        ? withoutMix.filter((l) => l !== value)
        : [...withoutMix, value];
    });
  }

  function goToStep(index: number) {
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, index)));
  }

  function handleContinue() {
    const current = STEPS[stepIndex];
    if (stepHasBlockingError(current.id)) {
      stepFieldMap[current.id].forEach(markTouched);
      setShowErrors(true);
      return;
    }
    goToStep(stepIndex + 1);
  }

  // ── Uploads ───────────────────────────────────────────────────────────────
  async function uploadCover(file: File): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile — reload the page and try again.");
    }
    const token = await getToken();
    if (!token) {
      throw new Error("Your session has expired — sign in again.");
    }
    return uploadListingMedia(token, hostProfileId, file, "cover");
  }

  async function uploadGallerySlot(file: File, slotIndex: number): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile — reload the page and try again.");
    }
    const token = await getToken();
    if (!token) {
      throw new Error("Your session has expired — sign in again.");
    }
    return uploadListingMedia(token, hostProfileId, file, slotIndex);
  }

  async function removeGalleryImage(url: string): Promise<void> {
    if (!hostProfileId) return;
    const token = await getToken();
    if (!token) return;
    try {
      const { pathname } = new URL(url);
      const prefix = `/storage/v1/object/public/${LISTING_MEDIA_BUCKET}/`;
      if (pathname.startsWith(prefix)) {
        const segments = pathname.slice(prefix.length).split("/");
        // Path structure: {hostProfileId}/{slot} — slot is the last segment.
        const slotSegment = segments[1];
        const slot = slotSegment !== undefined ? parseInt(slotSegment, 10) : NaN;
        if (Number.isInteger(slot) && slot >= 0) {
          await deleteListingMedia(token, hostProfileId, slot);
        }
      }
    } catch {
      // Non-fatal: if deletion fails the DB update is still the source of truth.
    }
  }

  /**
   * The report date for a host-stated fact group — the honesty rule both
   * groups obey, in one place so they cannot drift apart.
   *
   * `reportedAt` is only stamped when the host actually CHANGED an answer in
   * THAT group. Re-stamping on every save would claim "the host confirmed this
   * today" every time they edited an unrelated field like pay — turning the
   * freshness signal into a lie, and a stale-but-dated report is exactly what
   * that signal exists to expose. Unchanged answers keep their original date; a
   * report the host never dated stays undated (freshness reads null = unknown
   * age, which is not the same as fresh).
   *
   * statedFactsKey ignores the date and sorts keys, so neither the existing
   * timestamp nor serialization order can masquerade as a change.
   */
  function stampedReportDate(
    next: object,
    previous: { readonly reportedAt?: string } | undefined,
  ): string | undefined {
    const changed = statedFactsKey(next) !== statedFactsKey(previous);
    return changed ? new Date().toISOString() : previous?.reportedAt;
  }

  /**
   * The logistics payload, with an HONEST report date (see stampedReportDate).
   */
  function buildLogisticsPayload() {
    // sanitize on the client too, so what we stamp is what will persist.
    const next = sanitizeConnectivity(connectivity);
    if (!next) return {};

    const previous = sanitizeConnectivity(initial?.connectivity);
    const reportedAt = stampedReportDate(next, previous);

    return {
      connectivity: reportedAt ? { ...next, reportedAt } : next,
    };
  }

  /**
   * The category-depth payload (069), with its OWN honest report date.
   *
   * Computed entirely separately from logistics — that separation is the whole
   * reason 069 is its own column. If the two shared one object, editing the
   * vessel length would look like a change to the connectivity report and stamp
   * a fresh date on it, claiming the host re-confirmed an internet speed they
   * never touched.
   */
  function buildCategoryDepthPayload() {
    const next = sanitizeMaritimeDepth(maritime);
    if (!next) return {};

    const previous = sanitizeMaritimeDepth(initial?.maritime);
    const reportedAt = stampedReportDate(next, previous);

    return {
      maritime: reportedAt ? { ...next, reportedAt } : next,
    };
  }

  // ── Submit (create draft / save changes) ───────────────────────────────────
  function submitForm() {
    setError(null);

    if (title.trim().length === 0 || !derivedCategory) {
      setShowErrors(true);
      markTouched("title");
      markTouched("lanes");
      setStepIndex(0);
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("category", derivedCategory);
    formData.set("locationName", locationName.trim());
    formData.set("housingDescription", housingDescription.trim());
    formData.set("mealsDescription", mealsDescription.trim());
    // Always submitted, INCLUDING the empty unanswered state — that is a fact
    // about the listing ("nobody has answered yet"), not a missing field, and
    // the writer must record it rather than leave a stale value in place.
    formData.set("housingProvision", housingProvision);
    formData.set("mealsProvision", mealsProvision);
    formData.set("payMin", payMin.trim());
    formData.set("payMax", payMax.trim());
    formData.set("payPeriod", payPeriod);
    formData.set("summary", summary.trim());
    formData.set("startDate", startDate.trim());
    formData.set("endDate", endDate.trim());
    formData.set("coverPhotoUrl", coverPhotoUrl);
    formData.set("galleryUrls", JSON.stringify(galleryImages.map((img) => img.url)));
    formData.set("logistics", JSON.stringify(buildLogisticsPayload()));
    formData.set("categoryDepth", JSON.stringify(buildCategoryDepthPayload()));

    startTransition(async () => {
      if (mode === "edit" && listingId) {
        const result = await updateListingAction(listingId, formData);
        if (!result.ok) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        router.push(`/host/listings/${listingId}`);
        router.refresh();
        return;
      }

      const result = await createListingAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(
        result.listingId ? `/host/listings/${result.listingId}` : "/host/listings",
      );
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitForm();
  }

  // ── Live preview card data ─────────────────────────────────────────────────
  const previewData: DiscoveryCardData = useMemo(() => {
    const hasStart = Boolean(startDate);
    const hasEnd = Boolean(endDate);
    const window = hasStart && hasEnd
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : hasStart
        ? `From ${formatDate(startDate)}`
        : hasEnd
          ? `Until ${formatDate(endDate)}`
          : "Open timing";

    return {
      id: listingId ?? "preview",
      hostName: hostName?.trim() || "Your business",
      title: title.trim() || "Untitled role",
      category: derivedCategory ?? "mix",
      location: locationName.trim(),
      opportunityWindow: window,
      begins: hasStart ? formatDate(startDate) : undefined,
      ends: hasEnd ? formatDate(endDate) : undefined,
      coverImageUrl: coverPhotoUrl || galleryImages[0]?.url || undefined,
      hostAvatarUrl: hostAvatarUrl || undefined,
      verifiedHost: hasVerifiedHostSubscription(hostSubscriptionTier),
      // The preview must show what a SEEKER will see. It used to reproduce the
      // very bug it was meant to expose — a blank description previewed as "Not
      // included", so the host saw their listing confidently answering a
      // question they had skipped, and had no reason to think anything was
      // wrong. An unanswered benefit now previews as "Not stated", which is
      // both the truth and the prompt to go answer it.
      triad: {
        housing: triadPreview(housingProvision, housingDescription),
        meals: triadPreview(mealsProvision, mealsDescription),
        pay: formatPayDisplay(payMin, payMax, payPeriod),
      },
      benefitProvision: {
        housing: housingProvision === UNCHOSEN ? "not_stated" : housingProvision,
        meals: mealsProvision === UNCHOSEN ? "not_stated" : mealsProvision,
        pay: toNumber(payMin) || toNumber(payMax) ? "provided" : "not_stated",
      },
    };
  }, [
    listingId,
    hostName,
    hostAvatarUrl,
    hostSubscriptionTier,
    title,
    derivedCategory,
    locationName,
    startDate,
    endDate,
    coverPhotoUrl,
    galleryImages,
    housingDescription,
    mealsDescription,
    // The preview reads these now, so it must recompute when they change —
    // otherwise the host flips "Is housing included?" and the card they are
    // watching says nothing changed, which is precisely the false reassurance
    // this whole change exists to remove.
    housingProvision,
    mealsProvision,
    payMin,
    payMax,
    payPeriod,
  ]);

  // Feed placement — derived from the real host tier via the shared monetization
  // util (maps host tier → hostTier). Boost is a separate purchase, so it is not
  // an input here; match score is seeker-side and never applies to the host view.
  const placement = useMemo(() => {
    const tier: HostTier =
      hostSubscriptionTier && hostSubscriptionTier !== "none" ? hostSubscriptionTier : "none";
    const rank = monetizationRank({ hostTier: tier });
    if (rank >= 400) return "Top of feed";
    if (rank >= 200) return "Priority placement";
    if (rank >= 100) return "Standard-plus placement";
    return "Standard placement";
  }, [hostSubscriptionTier]);

  const noPreviewAction = () => undefined;

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const progressPct = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  // ── Render helpers ──────────────────────────────────────────────────────────
  function renderReqTag(required: boolean) {
    return (
      <span className={`${styles.reqTag} ${required ? styles.reqTagRequired : styles.reqTagOptional}`}>
        {required ? "Required" : "Optional"}
      </span>
    );
  }

  function renderFieldError(name: string) {
    const message = fieldError(name);
    if (!message) return null;
    return (
      <span className={styles.fieldError} role="alert">
        <Icon name="system.warning" size={14} aria-hidden />
        {message}
      </span>
    );
  }

  return (
    <>
      <div className={styles.composer}>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {/* ── Stepper ── */}
          <nav className={styles.stepper} aria-label="Listing steps">
            <span className={styles.stepStatus}>
              Step {stepIndex + 1} of {STEPS.length} — {currentStep.name}
            </span>
            <div className={styles.progressTrack} aria-hidden>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={styles.stepChips}>
              {STEPS.map((step, index) => {
                const active = index === stepIndex;
                const done = index < stepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`${styles.stepChip} ${active ? styles.stepChipActive : ""} ${done ? styles.stepChipDone : ""}`}
                    onClick={() => goToStep(index)}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className={styles.stepChipIndex}>
                      {done ? <Icon name="system.success" size={12} aria-hidden /> : index + 1}
                    </span>
                    {step.name}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ── BASICS ── */}
          {currentStep.id === "basics" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Basics</h2>
                  {renderReqTag(true)}
                </div>
                <p className={styles.stepDesc}>
                  Name the role and pick the lane(s) it belongs to — seekers browse by lane.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="listing-title">
                    Title
                  </label>
                </div>
                <input
                  className={`${styles.input} ${fieldError("title") ? styles.inputError : ""}`}
                  id="listing-title"
                  name="title"
                  type="text"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => markTouched("title")}
                  placeholder="Orchard Harvest Crew"
                />
                {renderFieldError("title")}
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label} id="lane-label">
                    Lane(s)
                  </span>
                  <span className={styles.optionalHint}>Pick one, or several for a Mix</span>
                </div>
                <div className={styles.laneGrid} role="group" aria-labelledby="lane-label">
                  {LANE_OPTIONS.map((lane) => {
                    const active = lanes.includes(lane.value);
                    return (
                      <button
                        key={lane.value}
                        type="button"
                        className={`${styles.laneChip} ${active ? styles.laneChipActive : ""}`}
                        onClick={() => toggleLane(lane.value)}
                        aria-pressed={active}
                      >
                        <Icon name={lane.icon} size={20} aria-hidden />
                        {lane.label}
                        <span className={styles.laneCheck}>
                          <Icon name="system.success" size={16} aria-hidden />
                        </span>
                      </button>
                    );
                  })}
                </div>
                {multiLane ? (
                  <p className={styles.laneMixNote}>
                    <Icon name="category.mix" size={16} aria-hidden />
                    Multiple lanes — seekers will see this as a Mix listing.
                  </p>
                ) : null}
                {renderFieldError("lanes")}
              </div>
            </div>
          ) : null}

          {/* ── LOCATION ── */}
          {currentStep.id === "location" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Location</h2>
                  {renderReqTag(false)}
                </div>
                <p className={styles.stepDesc}>
                  Where is the opportunity? A recognizable place helps seekers picture the move.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="listing-location">
                    Location name
                  </label>
                </div>
                <input
                  className={styles.input}
                  id="listing-location"
                  name="locationName"
                  type="text"
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  placeholder="Wenatchee, WA"
                />
                <p className={styles.hint}>
                  Use a town + state or region. Precise map coordinates are set later on the
                  listing.
                </p>
              </div>

              {/* Connectivity — a property of the PLACE, and often the fact that
                  decides whether someone can take the role at all. */}
              <ConnectivityFields value={connectivity} onChange={setConnectivity} />

              {/* The vessel (069) — only asked of a maritime listing, because
                  these questions are meaningless anywhere else.

                  The `|| hasMaritimeFacts` clause is not redundant: a host who
                  stated vessel facts and then re-laned the listing must still be
                  able to SEE and CLEAR them. Gating on the lane alone would
                  leave real, rendered facts with no way to edit them — the
                  listing would keep telling seekers about a boat the host can no
                  longer reach. (The submit path round-trips them either way, so
                  nothing is silently wiped.) */}
              {showMaritimeFields ? (
                <MaritimeDepthFields value={maritime} onChange={setMaritime} />
              ) : null}
            </div>
          ) : null}

          {/* ── TIMING ── */}
          {currentStep.id === "timing" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Dates &amp; season</h2>
                  {renderReqTag(false)}
                </div>
                <p className={styles.stepDesc}>
                  When does the role run? Leave a date open if timing is flexible.
                </p>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-start-date">
                      Start date
                    </label>
                  </div>
                  <input
                    className={styles.input}
                    id="listing-start-date"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-end-date">
                      End date
                    </label>
                  </div>
                  <input
                    className={`${styles.input} ${fieldError("endDate") ? styles.inputError : ""}`}
                    id="listing-end-date"
                    name="endDate"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                    onBlur={() => markTouched("endDate")}
                  />
                  {renderFieldError("endDate")}
                </div>
              </div>
            </div>
          ) : null}

          {/* ── OFFER: HOUSING · MEALS · PAY ── */}
          {currentStep.id === "offer" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Housing · Meals · Pay</h2>
                  {renderReqTag(true)}
                </div>
                <p className={styles.stepDesc}>
                  The three things seekers decide on — shown on every card. Be specific and honest.
                </p>
              </div>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>The offer</legend>

                {/* The housing DECISION — explicit, and required to publish.
                    This select used to not exist: the hint here said "Leave
                    blank if not provided", and the writer inferred the answer
                    from whether the textarea had text. So a host who simply had
                    nothing to write shipped a listing telling seekers "Housing:
                    Not included" — an answer they never gave. A description is
                    prose about housing; it was never a decision. */}
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-housing-provision">
                      Is housing included?
                    </label>
                    <span className={styles.optionalHint}>Required to publish</span>
                  </div>
                  <select
                    className={styles.input}
                    id="listing-housing-provision"
                    value={housingProvision}
                    onChange={(event) => setHousingProvision(event.target.value as BenefitChoiceValue)}
                  >
                    <option value={UNCHOSEN}>{NOT_STATED_LABEL} — pick one to publish</option>
                    <option value="provided">Yes — housing is included</option>
                    <option value="not_provided">No — housing is not included</option>
                  </select>
                  {housingProvision === UNCHOSEN ? (
                    <p className={styles.hint}>
                      Until you answer, seekers are told nobody stated it — never that it&rsquo;s a
                      no. You can save a draft either way.
                    </p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-housing">
                      Housing details
                    </label>
                    <span className={styles.optionalHint}>Optional</span>
                  </div>
                  <textarea
                    className={styles.textarea}
                    id="listing-housing"
                    name="housingDescription"
                    rows={2}
                    value={housingDescription}
                    onChange={(event) => setHousingDescription(event.target.value)}
                    placeholder="On-site private cabin, utilities included."
                  />
                  {canEditBenefits ? (
                    <button
                      type="button"
                      className={styles.benefitLink}
                      onClick={() => setBenefitKind("housing")}
                    >
                      <Icon name="nav.photos" size={16} aria-hidden />
                      Add housing photos &amp; amenities
                    </button>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-meals-provision">
                      Are meals included?
                    </label>
                    <span className={styles.optionalHint}>Required to publish</span>
                  </div>
                  <select
                    className={styles.input}
                    id="listing-meals-provision"
                    value={mealsProvision}
                    onChange={(event) => setMealsProvision(event.target.value as BenefitChoiceValue)}
                  >
                    <option value={UNCHOSEN}>{NOT_STATED_LABEL} — pick one to publish</option>
                    <option value="provided">Yes — meals are included</option>
                    <option value="not_provided">No — meals are not included</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <label className={styles.label} htmlFor="listing-meals">
                      Meal details
                    </label>
                    <span className={styles.optionalHint}>Optional</span>
                  </div>
                  <textarea
                    className={styles.textarea}
                    id="listing-meals"
                    name="mealsDescription"
                    rows={2}
                    value={mealsDescription}
                    onChange={(event) => setMealsDescription(event.target.value)}
                    placeholder="Three daily meals provided during the season."
                  />
                  {canEditBenefits ? (
                    <button
                      type="button"
                      className={styles.benefitLink}
                      onClick={() => setBenefitKind("meals")}
                    >
                      <Icon name="nav.photos" size={16} aria-hidden />
                      Add meal photos &amp; details
                    </button>
                  ) : null}
                </div>

                <div className={styles.rowThree}>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label className={styles.label} htmlFor="listing-pay-min">
                        Pay min
                      </label>
                    </div>
                    <input
                      className={styles.input}
                      id="listing-pay-min"
                      name="payMin"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={payMin}
                      onChange={(event) => setPayMin(event.target.value)}
                      placeholder="18"
                    />
                  </div>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label className={styles.label} htmlFor="listing-pay-max">
                        Pay max
                      </label>
                    </div>
                    <input
                      className={`${styles.input} ${fieldError("payMax") ? styles.inputError : ""}`}
                      id="listing-pay-max"
                      name="payMax"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={payMax}
                      onChange={(event) => setPayMax(event.target.value)}
                      onBlur={() => markTouched("payMax")}
                      placeholder="24"
                    />
                  </div>
                  <div className={styles.field}>
                    <div className={styles.labelRow}>
                      <label className={styles.label} htmlFor="listing-pay-period">
                        Pay unit
                      </label>
                    </div>
                    <select
                      className={styles.input}
                      id="listing-pay-period"
                      name="payPeriod"
                      value={payPeriod}
                      onChange={(event) => setPayPeriod(event.target.value as CompensationUnit)}
                    >
                      {COMPENSATION_UNIT.map((unit) => (
                        <option key={unit} value={unit}>
                          {PAY_PERIOD_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {renderFieldError("payMax")}
                <p className={styles.fieldsetNote}>
                  Pay is entered in whole currency units (e.g. dollars) — per day or per hour with
                  the unit above — and stored to the cent.
                </p>
              </fieldset>

              <div className={styles.bucketNote}>
                <span className={styles.bucketNoteIcon}>
                  <Icon name="nav.photos" size={20} aria-hidden />
                </span>
                <span className={styles.bucketNoteBody}>
                  Housing and meal photo buckets live on your host profile — upload them once and
                  they&apos;re reused across every listing.
                  <Link className={styles.bucketNoteLink} href="/host/profile/edit">
                    Manage photo buckets
                  </Link>
                </span>
              </div>
            </div>
          ) : null}

          {/* ── PHOTOS ── */}
          {currentStep.id === "photos" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Photos</h2>
                  {renderReqTag(false)}
                </div>
                <p className={styles.stepDesc}>
                  A strong cover is the first thing seekers see. Add gallery shots to tell the story.
                </p>
              </div>

              {hostProfileId ? (
                <>
                  <div className={styles.field}>
                    <span className={styles.label}>Cover photo</span>
                    <ImageUpload
                      label="Add a cover photo"
                      currentUrl={coverPhotoUrl || undefined}
                      uploader={uploadCover}
                      onUpload={setCoverPhotoUrl}
                      disabled={isPending}
                    />
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>Gallery photos</span>
                    <MediaGalleryUpload
                      images={galleryImages}
                      onChange={setGalleryImages}
                      uploader={uploadGallerySlot}
                      remover={removeGalleryImage}
                      disabled={isPending}
                    />
                  </div>
                </>
              ) : (
                <div className={styles.bucketNote}>
                  <span className={styles.bucketNoteIcon}>
                    <Icon name="system.info" size={20} aria-hidden />
                  </span>
                  <span className={styles.bucketNoteBody}>
                    Finish your host profile to unlock photo uploads for this listing.
                    <Link className={styles.bucketNoteLink} href="/host/profile/edit">
                      Complete host profile
                    </Link>
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* ── STORY & REQUIREMENTS ── */}
          {currentStep.id === "story" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Story &amp; requirements</h2>
                  {renderReqTag(false)}
                </div>
                <p className={styles.stepDesc}>
                  Describe the work, who would love it, and what you need from applicants.
                </p>
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor="listing-summary">
                    Summary
                  </label>
                </div>
                <textarea
                  className={styles.textarea}
                  id="listing-summary"
                  name="summary"
                  rows={6}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Describe the opportunity, the day-to-day, who thrives here, and any requirements — experience, licenses, physical demands, minimum stay."
                />
                <p className={styles.hint}>
                  Include requirements here (experience, certifications, minimum commitment) so
                  applicants self-select before applying.
                </p>
              </div>
            </div>
          ) : null}

          {/* ── REVIEW ── */}
          {currentStep.id === "review" ? (
            <div className={styles.stepPanel}>
              <div className={styles.stepHead}>
                <div className={styles.stepHeadTop}>
                  <h2 className={styles.stepTitle}>Review</h2>
                </div>
                <p className={styles.stepDesc}>
                  Here&apos;s your listing at a glance — the live card on the side is exactly what
                  seekers will see. Create it as a draft; publishing happens from your listings.
                </p>
              </div>

              <ul className={styles.reviewList}>
                <ReviewItem label="Title" value={title.trim()} />
                <ReviewItem
                  label="Lane"
                  value={
                    derivedCategory
                      ? multiLane
                        ? `Mix (${lanes.join(", ")})`
                        : derivedCategory
                      : ""
                  }
                />
                <ReviewItem label="Location" value={locationName.trim()} optional />
                <ReviewItem
                  label="Dates"
                  value={
                    startDate || endDate
                      ? `${startDate ? formatDate(startDate) : "Flexible"} – ${endDate ? formatDate(endDate) : "Flexible"}`
                      : ""
                  }
                  optional
                />
                <ReviewItem label="Housing" value={housingDescription.trim()} optional />
                <ReviewItem label="Meals" value={mealsDescription.trim()} optional />
                <ReviewItem label="Pay" value={formatPayDisplay(payMin, payMax, payPeriod)} />
                <ReviewItem
                  label="Photos"
                  value={
                    (coverPhotoUrl ? 1 : 0) + galleryImages.length > 0
                      ? `${(coverPhotoUrl ? 1 : 0) + galleryImages.length} added`
                      : ""
                  }
                  optional
                />
                <ReviewItem label="Story" value={summary.trim()} optional />
              </ul>
            </div>
          ) : null}

          {/* ── Nav / actions ── */}
          <div className={styles.navRow}>
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="ghost"
                icon="action.back"
                onClick={() => goToStep(stepIndex - 1)}
                disabled={isPending}
              >
                Back
              </Button>
            ) : (
              <Link className={styles.cancel} href={cancelHref}>
                Cancel
              </Link>
            )}

            <div className={styles.navRight}>
              <Button
                type="button"
                variant="ghost"
                onClick={submitForm}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save draft"}
              </Button>
              {isLastStep ? (
                <Button
                  type="submit"
                  variant="primary"
                  icon="action.forward"
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : submitLabel}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  icon="action.forward"
                  onClick={handleContinue}
                  disabled={isPending}
                >
                  Continue
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* ── Live preview ── */}
        <aside className={styles.previewPane} aria-label="Live listing preview">
          <div className={styles.previewHead}>
            <span className={styles.previewDot} aria-hidden />
            <span className={styles.previewTitle}>Live preview</span>
          </div>
          <div className={styles.previewCardWrap}>
            <DiscoveryCard
              data={previewData}
              surface="discovery_feed"
              onOpen={noPreviewAction}
              onApply={noPreviewAction}
              onSave={noPreviewAction}
              onSkip={noPreviewAction}
            />
          </div>
          <p className={styles.previewCaption}>
            This is how seekers see your listing as you build it.
          </p>
          {hostSubscriptionTier ? (
            <p className={styles.previewMeta}>
              <Icon name="status.boosted" size={14} aria-hidden />
              Feed placement:&nbsp;
              <span className={styles.previewMetaValue}>{placement}</span>
            </p>
          ) : null}
        </aside>
      </div>

      {/* Structured benefit editor — mounted OUTSIDE the form so its Save never
          submits the listing form. Edit mode only (needs a saved listing id). */}
      {canEditBenefits && listingId ? (
        <BenefitTrustModal
          mode="edit"
          open={benefitKind !== null}
          kind={benefitKind ?? "housing"}
          onClose={() => setBenefitKind(null)}
          listingId={listingId}
        />
      ) : null}
    </>
  );
}

/** One recap row on the Review step; flags empty recommended fields. */
function ReviewItem({
  label,
  value,
  optional,
}: {
  readonly label: string;
  readonly value: string;
  readonly optional?: boolean;
}) {
  return (
    <li className={styles.reviewItem}>
      <span className={styles.reviewKey}>{label}</span>
      {value ? (
        <span className={styles.reviewVal}>{value}</span>
      ) : (
        <span className={`${styles.reviewVal} ${styles.reviewMissing}`}>
          <Icon name={optional ? "system.info" : "system.warning"} size={14} aria-hidden />
          {optional ? "Not added yet" : "Needs attention"}
        </span>
      )}
    </li>
  );
}
