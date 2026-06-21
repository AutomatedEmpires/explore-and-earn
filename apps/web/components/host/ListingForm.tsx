"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { useAuth } from "@clerk/nextjs";

import { Button } from "@explore-and-earn/ui";
import {
  uploadListingMedia,
  deleteListingMedia,
  LISTING_MEDIA_BUCKET,
} from "@explore-and-earn/db/client";
import {
  COMPENSATION_UNIT,
  MARKETPLACE_CATEGORIES,
  type CompensationUnit,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";

import { ImageUpload } from "../ImageUpload";
import { MediaGalleryUpload, type GalleryItem } from "./MediaGalleryUpload";
import { createListingAction, updateListingAction } from "../../app/actions/listings";
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
  readonly payMin?: string;
  readonly payMax?: string;
  readonly payPeriod?: CompensationUnit;
  readonly summary?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly coverPhotoUrl?: string;
  readonly galleryUrls?: ReadonlyArray<string>;
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

function categoryLabel(category: MarketplaceCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Shared create/edit listing form. Client component that gathers the listing
 * basics plus the Housing / Meals / Pay triad (product law \u2014 never "Perks";
 * see AGENTS.md and packages/contracts/src/benefits.ts) and submits to the
 * listing server actions. Token-only styling via the CSS module.
 */
export function ListingForm({ mode, listingId, initial, hostProfileId }: ListingFormProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [coverPhotoUrl, setCoverPhotoUrl] = useState(initial?.coverPhotoUrl ?? "");
  const [galleryImages, setGalleryImages] = useState<ReadonlyArray<GalleryItem>>(() =>
    (initial?.galleryUrls ?? []).map((url, i) => ({
      id: `gallery-${i}`,
      url,
      bucket: "cover_photo" as const,
    })),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<MarketplaceCategory>(
    initial?.category ?? MARKETPLACE_CATEGORIES[0],
  );
  const [locationName, setLocationName] = useState(initial?.locationName ?? "");
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

  const submitLabel = mode === "create" ? "Create listing" : "Save changes";
  const cancelHref = listingId ? `/host/listings/${listingId}` : "/host/listings";

  async function uploadCover(file: File): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile \u2014 reload the page and try again.");
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      throw new Error("Your session has expired \u2014 sign in again.");
    }
    return uploadListingMedia(token, hostProfileId, file, "cover");
  }

  async function uploadGallerySlot(file: File, slotIndex: number): Promise<string> {
    if (!hostProfileId) {
      throw new Error("Missing host profile \u2014 reload the page and try again.");
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      throw new Error("Your session has expired \u2014 sign in again.");
    }
    return uploadListingMedia(token, hostProfileId, file, slotIndex);
  }

  async function removeGalleryImage(url: string): Promise<void> {
    if (!hostProfileId) return;
    const token = await getToken({ template: "supabase" });
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length === 0) {
      setError("A listing title is required.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("category", category);
    formData.set("locationName", locationName.trim());
    formData.set("housingDescription", housingDescription.trim());
    formData.set("mealsDescription", mealsDescription.trim());
    formData.set("payMin", payMin.trim());
    formData.set("payMax", payMax.trim());
    formData.set("payPeriod", payPeriod);
    formData.set("summary", summary.trim());
    formData.set("startDate", startDate.trim());
    formData.set("endDate", endDate.trim());
    formData.set("coverPhotoUrl", coverPhotoUrl);
    formData.set("galleryUrls", JSON.stringify(galleryImages.map((img) => img.url)));

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

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {hostProfileId ? (
        <div className={styles.field}>
          <span className={styles.label}>Cover photo</span>
          <ImageUpload
            label="Add a cover photo"
            currentUrl={coverPhotoUrl || undefined}
            uploader={uploadCover}
            onUpload={setCoverPhotoUrl}
            disabled={isPending}
          />
          <input type="hidden" name="coverPhotoUrl" value={coverPhotoUrl} />
        </div>
      ) : null}

      {hostProfileId ? (
        <div className={styles.field}>
          <span className={styles.label}>Gallery photos</span>
          <MediaGalleryUpload
            images={galleryImages}
            onChange={setGalleryImages}
            uploader={uploadGallerySlot}
            remover={removeGalleryImage}
            disabled={isPending}
          />
          <input
            type="hidden"
            name="galleryUrls"
            value={JSON.stringify(galleryImages.map((img) => img.url))}
          />
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-title">
          Title
        </label>
        <input
          className={styles.input}
          id="listing-title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Orchard Harvest Crew"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-category">
            Category
          </label>
          <select
            className={styles.input}
            id="listing-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as MarketplaceCategory)}
          >
            {MARKETPLACE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-location">
            Location name
          </label>
          <input
            className={styles.input}
            id="listing-location"
            name="locationName"
            type="text"
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
            placeholder="Wenatchee, WA"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-summary">
          Summary
        </label>
        <textarea
          className={styles.textarea}
          id="listing-summary"
          name="summary"
          rows={4}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Describe the opportunity, the work, and who would love it."
        />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Housing \u00b7 Meals \u00b7 Pay</legend>
        <p className={styles.fieldsetNote}>
          Housing, Meals, and Pay are the core promise to seekers.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-housing">
            Housing
          </label>
          <textarea
            className={styles.textarea}
            id="listing-housing"
            name="housingDescription"
            rows={2}
            value={housingDescription}
            onChange={(event) => setHousingDescription(event.target.value)}
            placeholder="On-site private cabin, utilities included."
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-meals">
            Meals
          </label>
          <textarea
            className={styles.textarea}
            id="listing-meals"
            name="mealsDescription"
            rows={2}
            value={mealsDescription}
            onChange={(event) => setMealsDescription(event.target.value)}
            placeholder="Three daily meals provided during the season."
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="listing-pay-min">
              Pay min
            </label>
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
            <label className={styles.label} htmlFor="listing-pay-max">
              Pay max
            </label>
            <input
              className={styles.input}
              id="listing-pay-max"
              name="payMax"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={payMax}
              onChange={(event) => setPayMax(event.target.value)}
              placeholder="24"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="listing-pay-period">
              Pay period
            </label>
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
        <p className={styles.fieldsetNote}>
          Pay is entered in whole currency units (e.g. dollars) and stored to the cent.
        </p>
      </fieldset>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-start-date">
            Start date
          </label>
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
          <label className={styles.label} htmlFor="listing-end-date">
            End date
          </label>
          <input
            className={styles.input}
            id="listing-end-date"
            name="endDate"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" icon="action.forward" disabled={isPending}>
          {isPending ? "Saving\u2026" : submitLabel}
        </Button>
        <Link className={styles.cancel} href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
