"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";
import { NOT_STATED_LABEL } from "@explore-and-earn/contracts";

import { confirmClaimListingAction } from "../../app/actions/listingClaims";
import styles from "./ClaimConfirmationForm.module.css";

/**
 * Everything the confirmation step must SHOW the employer — the exact field
 * set confirmClaimListingAction/sanitizeConfirmed accept, plus the triad
 * evidence so never-stated values honestly present as "Not stated".
 */
export interface ConfirmationPrefill {
  readonly title: string;
  readonly description: string | null;
  readonly locationDisplay: string | null;
  readonly housingIncluded: boolean;
  readonly housingDescription: string | null;
  readonly mealsIncluded: boolean;
  readonly mealsDescription: string | null;
  readonly compensationMinCents: number | null;
  readonly compensationMaxCents: number | null;
  readonly compensationUnit: string | null;
  readonly compensationSummary: string | null;
  readonly beginsAt: string | null;
  readonly endsAt: string | null;
  readonly housingEvidence: string;
  readonly mealsEvidence: string;
  readonly payEvidence: string;
}

/** Tri-state benefit choice: leave-not-stated stays honestly unconfirmed. */
type BenefitChoice = "not_stated" | "yes" | "no";

function initialBenefitChoice(evidence: string, value: boolean): BenefitChoice {
  if (evidence === "not_stated") return "not_stated";
  return value ? "yes" : "no";
}

/** ISO timestamp → the yyyy-mm-dd a date input wants (empty when absent). */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

/** Integer cents → a dollars string for a number input (empty when absent). */
function toDollarsInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** Dollars string → integer cents, or null when blank/invalid. */
function parseDollarsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * The confirmation step of the claim-to-verify flow: EVERY sourced value is
 * shown prefilled for the approved employer to correct or accept. Accepting
 * without editing is an explicit act — the copy says so — because conversion
 * marks reviewed values employer-confirmed. Benefits the source never stated
 * default to "Not stated"; leaving them that way keeps them honestly
 * unconfirmed (the field is simply omitted from the confirmation payload).
 */
export function ClaimConfirmationForm({
  claimId,
  hostProfileId,
  listingId,
  prefill,
}: {
  readonly claimId: string;
  readonly hostProfileId: string;
  readonly listingId: string;
  readonly prefill: ConfirmationPrefill;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(prefill.title);
  const [description, setDescription] = useState(prefill.description ?? "");
  const [locationDisplay, setLocationDisplay] = useState(prefill.locationDisplay ?? "");
  const [housing, setHousing] = useState<BenefitChoice>(
    initialBenefitChoice(prefill.housingEvidence, prefill.housingIncluded),
  );
  const [housingDescription, setHousingDescription] = useState(
    prefill.housingDescription ?? "",
  );
  const [meals, setMeals] = useState<BenefitChoice>(
    initialBenefitChoice(prefill.mealsEvidence, prefill.mealsIncluded),
  );
  const [mealsDescription, setMealsDescription] = useState(prefill.mealsDescription ?? "");
  const [payMin, setPayMin] = useState(toDollarsInput(prefill.compensationMinCents));
  const [payMax, setPayMax] = useState(toDollarsInput(prefill.compensationMaxCents));
  const [payUnit, setPayUnit] = useState(prefill.compensationUnit ?? "");
  const [paySummary, setPaySummary] = useState(prefill.compensationSummary ?? "");
  const [beginsAt, setBeginsAt] = useState(toDateInput(prefill.beginsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(prefill.endsAt));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("A listing title is required.");
      return;
    }
    const minCents = parseDollarsToCents(payMin);
    const maxCents = parseDollarsToCents(payMax);
    if (payMin.trim() && minCents === null) {
      setError("Minimum pay must be a valid amount.");
      return;
    }
    if (payMax.trim() && maxCents === null) {
      setError("Maximum pay must be a valid amount.");
      return;
    }
    if (minCents !== null && maxCents !== null && minCents > maxCents) {
      setError("Minimum pay can't exceed maximum pay.");
      return;
    }

    // Only present keys are applied; a blank optional field means "leave the
    // sourced value as it is" and a not_stated benefit left untouched stays
    // honestly unconfirmed.
    const confirmed: Record<string, string | number | boolean> = {
      title: title.trim(),
    };
    if (description.trim()) confirmed.description = description.trim();
    if (locationDisplay.trim()) confirmed.locationDisplay = locationDisplay.trim();
    // A description may only ride along with an explicit yes/no selection:
    // convert_claimed_listing flips evidence to 'confirmed' only when the
    // included flag is present, so a description on a not_stated benefit
    // would update copy while the evidence honestly stayed not_stated — an
    // inconsistent half-confirmation. Leaving the choice unconfirmed drops
    // the description too.
    if (housing !== "not_stated") {
      confirmed.housingIncluded = housing === "yes";
      if (housingDescription.trim()) confirmed.housingDescription = housingDescription.trim();
    }
    if (meals !== "not_stated") {
      confirmed.mealsIncluded = meals === "yes";
      if (mealsDescription.trim()) confirmed.mealsDescription = mealsDescription.trim();
    }
    if (minCents !== null) confirmed.compensationMinCents = minCents;
    if (maxCents !== null) confirmed.compensationMaxCents = maxCents;
    if (payUnit.trim()) confirmed.compensationUnit = payUnit.trim();
    if (paySummary.trim()) confirmed.compensationSummary = paySummary.trim();
    if (beginsAt.trim()) confirmed.beginsAt = beginsAt.trim();
    if (endsAt.trim()) confirmed.endsAt = endsAt.trim();

    setSubmitting(true);
    const result = await confirmClaimListingAction(
      claimId,
      hostProfileId,
      confirmed as never,
    ).catch(() => ({ ok: false as const, error: "network" }));
    setSubmitting(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(confirmErrorCopy(result.error));
    }
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Confirm every detail</h1>
      <p className={styles.lead}>
        These are the listing&apos;s current values, exactly as sourced. Review
        each field — correct anything that&apos;s wrong, and confirm the rest.
        Submitting marks the reviewed details as confirmed by you and publishes
        the listing under your host profile.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            className={styles.input}
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          {prefill.description === null ? (
            <span className={styles.notStated}>{NOT_STATED_LABEL} by the source</span>
          ) : null}
          <textarea
            className={styles.textarea}
            rows={6}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Location</span>
          {prefill.locationDisplay === null ? (
            <span className={styles.notStated}>{NOT_STATED_LABEL} by the source</span>
          ) : null}
          <input
            className={styles.input}
            type="text"
            maxLength={200}
            value={locationDisplay}
            onChange={(e) => setLocationDisplay(e.target.value)}
            placeholder="e.g. Wenatchee, WA"
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Housing</legend>
          <label className={styles.field}>
            <span className={styles.label}>Is housing included?</span>
            <select
              className={styles.input}
              value={housing}
              onChange={(e) => setHousing(e.target.value as BenefitChoice)}
            >
              {prefill.housingEvidence === "not_stated" ? (
                <option value="not_stated">{NOT_STATED_LABEL} — leave unconfirmed</option>
              ) : null}
              <option value="yes">Included</option>
              <option value="no">Not included</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Housing details</span>
            <textarea
              className={styles.textarea}
              rows={2}
              maxLength={2000}
              value={housingDescription}
              onChange={(e) => setHousingDescription(e.target.value)}
              placeholder="e.g. Shared on-site cabin, utilities covered"
            />
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Meals</legend>
          <label className={styles.field}>
            <span className={styles.label}>Are meals included?</span>
            <select
              className={styles.input}
              value={meals}
              onChange={(e) => setMeals(e.target.value as BenefitChoice)}
            >
              {prefill.mealsEvidence === "not_stated" ? (
                <option value="not_stated">{NOT_STATED_LABEL} — leave unconfirmed</option>
              ) : null}
              <option value="yes">Included</option>
              <option value="no">Not included</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Meal details</span>
            <textarea
              className={styles.textarea}
              rows={2}
              maxLength={2000}
              value={mealsDescription}
              onChange={(e) => setMealsDescription(e.target.value)}
              placeholder="e.g. Three meals a day during the season"
            />
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Pay</legend>
          {prefill.payEvidence === "not_stated" ? (
            <p className={styles.notStated}>
              {NOT_STATED_LABEL} by the source — add pay details if you can.
            </p>
          ) : null}
          <div className={styles.rowPair}>
            <label className={styles.field}>
              <span className={styles.label}>Minimum (USD)</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={payMin}
                onChange={(e) => setPayMin(e.target.value)}
                placeholder="e.g. 18"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Maximum (USD)</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={payMax}
                onChange={(e) => setPayMax(e.target.value)}
                placeholder="e.g. 22"
              />
            </label>
          </div>
          <div className={styles.rowPair}>
            <label className={styles.field}>
              <span className={styles.label}>Per</span>
              <input
                className={styles.input}
                type="text"
                maxLength={20}
                value={payUnit}
                onChange={(e) => setPayUnit(e.target.value)}
                placeholder="e.g. hour"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Pay summary</span>
              <input
                className={styles.input}
                type="text"
                maxLength={200}
                value={paySummary}
                onChange={(e) => setPaySummary(e.target.value)}
                placeholder="e.g. $18–22/hr + tips"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Timeline</legend>
          <div className={styles.rowPair}>
            <label className={styles.field}>
              <span className={styles.label}>Begins</span>
              {prefill.beginsAt === null ? (
                <span className={styles.notStated}>{NOT_STATED_LABEL}</span>
              ) : null}
              <input
                className={styles.input}
                type="date"
                value={beginsAt}
                onChange={(e) => setBeginsAt(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Ends</span>
              {prefill.endsAt === null ? (
                <span className={styles.notStated}>{NOT_STATED_LABEL}</span>
              ) : null}
              <input
                className={styles.input}
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="system.warning" size={16} aria-hidden />
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Publishing…" : "Confirm and publish as my listing"}
        </Button>
        <p className={styles.disclaimer}>
          By confirming, you state these details are accurate. The listing
          becomes your verified listing; fields you left as &quot;
          {NOT_STATED_LABEL}&quot; stay marked that way rather than pretending
          you confirmed them.
        </p>
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() => router.push(`/listing/${listingId}`)}
        >
          Cancel for now
        </Button>
      </form>
    </div>
  );
}

function confirmErrorCopy(code: string | undefined): string {
  switch (code) {
    case "invalid_confirmed_fields":
      return "One of the fields is invalid — check lengths and amounts and try again.";
    case "claim_not_confirming":
      return "This claim isn't in the confirmation step anymore — refresh the page for its current status.";
    case "not_claimant":
      return "Only the person who submitted this claim can confirm it.";
    case "host_profile_mismatch":
      return "Your host profile doesn't match this claim — refresh the page and try again.";
    case "unauthenticated":
      return "Please sign in to continue.";
    default:
      return "Something went wrong publishing your listing. Please try again.";
  }
}
