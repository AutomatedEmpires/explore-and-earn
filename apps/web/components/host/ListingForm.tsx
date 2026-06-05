"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@explore-and-earn/ui";
import {
  BENEFIT_PROVISION,
  MARKETPLACE_CATEGORIES,
  type BenefitProvision,
  type BenefitTriad,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";

import { createListing, updateListing } from "../../app/actions/listings";
import styles from "./ListingForm.module.css";

export type ListingFormStatus = "draft" | "active";

export interface ListingFormInitialValues {
  readonly title?: string;
  readonly description?: string;
  readonly category?: MarketplaceCategory;
  readonly location?: string;
  readonly latitude?: string;
  readonly longitude?: string;
  readonly triad?: BenefitTriad;
  readonly status?: ListingFormStatus;
}

export interface ListingFormProps {
  readonly mode: "create" | "edit";
  /** Required in edit mode: the listing row id passed to updateListing. */
  readonly listingId?: string;
  readonly initial?: ListingFormInitialValues;
}

interface BenefitFieldState {
  provision: BenefitProvision;
  summary: string;
}

const PROVISION_LABEL: Record<BenefitProvision, string> = {
  provided: "Provided",
  partial: "Partial",
  not_provided: "Not provided",
};

const STATUS_OPTIONS: ReadonlyArray<{ value: ListingFormStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
];

function categoryLabel(category: MarketplaceCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function toBenefitState(info?: {
  readonly provision: BenefitProvision;
  readonly summary?: string;
}): BenefitFieldState {
  return {
    provision: info?.provision ?? "not_provided",
    summary: info?.summary ?? "",
  };
}

/**
 * Shared create/edit listing form. Client component that gathers the listing
 * basics plus the required Housing / Meals / Pay BenefitTriad (product law —
 * never "Perks"; see AGENTS.md and packages/contracts/src/benefits.ts) and
 * submits to the listings server actions. Token-only styling via the CSS module.
 */
export function ListingForm({ mode, listingId, initial }: ListingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<MarketplaceCategory>(
    initial?.category ?? MARKETPLACE_CATEGORIES[0],
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [latitude, setLatitude] = useState(initial?.latitude ?? "");
  const [longitude, setLongitude] = useState(initial?.longitude ?? "");
  const [status, setStatus] = useState<ListingFormStatus>(initial?.status ?? "draft");

  const [housing, setHousing] = useState<BenefitFieldState>(() =>
    toBenefitState(initial?.triad?.housing),
  );
  const [meals, setMeals] = useState<BenefitFieldState>(() =>
    toBenefitState(initial?.triad?.meals),
  );
  const [pay, setPay] = useState<BenefitFieldState>(() =>
    toBenefitState(initial?.triad?.pay),
  );

  const benefitFields = [
    {
      kind: "housing" as const,
      label: "Housing",
      placeholder: "On-site private cabin",
      value: housing,
      setValue: setHousing,
    },
    {
      kind: "meals" as const,
      label: "Meals",
      placeholder: "Three daily meals provided",
      value: meals,
      setValue: setMeals,
    },
    {
      kind: "pay" as const,
      label: "Pay",
      placeholder: "$18/hr + tips",
      value: pay,
      setValue: setPay,
    },
  ];

  const submitLabel = mode === "create" ? "Create listing" : "Save changes";
  const cancelHref = listingId ? `/host/listings/${listingId}` : "/host/listings";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length === 0) {
      setError("A listing title is required.");
      return;
    }

    const benefits = [housing, meals, pay];
    const hasBenefit = benefits.some(
      (benefit) =>
        benefit.provision !== "not_provided" || benefit.summary.trim().length > 0,
    );
    if (!hasBenefit) {
      setError("Add at least one benefit \u2014 Housing, Meals, or Pay.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("description", description.trim());
    formData.set("category", category);
    formData.set("location", location.trim());
    formData.set("latitude", latitude.trim());
    formData.set("longitude", longitude.trim());
    formData.set("status", status);
    formData.set("housingProvision", housing.provision);
    formData.set("housingSummary", housing.summary.trim());
    formData.set("mealsProvision", meals.provision);
    formData.set("mealsSummary", meals.summary.trim());
    formData.set("payProvision", pay.provision);
    formData.set("paySummary", pay.summary.trim());

    startTransition(async () => {
      const result =
        mode === "edit" && listingId
          ? await updateListing(listingId, formData)
          : await createListing(formData);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      router.push(result.id ? `/host/listings/${result.id}` : "/host/listings");
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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-description">
          Description
        </label>
        <textarea
          className={styles.textarea}
          id="listing-description"
          name="description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the opportunity, the work, and who would love it."
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
            onChange={(event) =>
              setCategory(event.target.value as MarketplaceCategory)
            }
          >
            {MARKETPLACE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Status</span>
          <div className={styles.toggle} role="group" aria-label="Listing status">
            {STATUS_OPTIONS.map((option) => {
              const selected = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    selected
                      ? `${styles.toggleButton} ${styles.toggleButtonActive}`
                      : styles.toggleButton
                  }
                  aria-pressed={selected}
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-location">
          Location
        </label>
        <input
          className={styles.input}
          id="listing-location"
          name="location"
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Wenatchee, WA"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-latitude">
            Latitude
          </label>
          <input
            className={styles.input}
            id="listing-latitude"
            name="latitude"
            type="number"
            inputMode="decimal"
            step="any"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            placeholder="47.4235"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-longitude">
            Longitude
          </label>
          <input
            className={styles.input}
            id="listing-longitude"
            name="longitude"
            type="number"
            inputMode="decimal"
            step="any"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            placeholder="-120.3103"
          />
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Housing \u00b7 Meals \u00b7 Pay</legend>
        <p className={styles.fieldsetNote}>
          The Housing, Meals, and Pay triad is required \u2014 add at least one.
        </p>
        {benefitFields.map((benefit) => (
          <div className={styles.benefit} key={benefit.kind}>
            <div className={styles.benefitRow}>
              <div className={styles.field}>
                <label
                  className={styles.label}
                  htmlFor={`listing-${benefit.kind}-provision`}
                >
                  {benefit.label}
                </label>
                <select
                  className={styles.input}
                  id={`listing-${benefit.kind}-provision`}
                  name={`${benefit.kind}Provision`}
                  value={benefit.value.provision}
                  onChange={(event) =>
                    benefit.setValue({
                      ...benefit.value,
                      provision: event.target.value as BenefitProvision,
                    })
                  }
                >
                  {BENEFIT_PROVISION.map((provision) => (
                    <option key={provision} value={provision}>
                      {PROVISION_LABEL[provision]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label
                  className={styles.label}
                  htmlFor={`listing-${benefit.kind}-summary`}
                >
                  {benefit.label} details
                </label>
                <input
                  className={styles.input}
                  id={`listing-${benefit.kind}-summary`}
                  name={`${benefit.kind}Summary`}
                  type="text"
                  value={benefit.value.summary}
                  onChange={(event) =>
                    benefit.setValue({
                      ...benefit.value,
                      summary: event.target.value,
                    })
                  }
                  placeholder={benefit.placeholder}
                />
              </div>
            </div>
          </div>
        ))}
      </fieldset>

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          icon="action.forward"
          disabled={isPending}
        >
          {isPending ? "Saving\u2026" : submitLabel}
        </Button>
        <Link className={styles.cancel} href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
