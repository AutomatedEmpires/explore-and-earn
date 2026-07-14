"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useOptionalGetToken } from "../../../../lib/useOptionalGetToken";


import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { uploadProfilePhoto } from "@explore-and-earn/db/client";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { ImageUpload } from "../../../../components/ImageUpload";
import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
import { saveProfilePhotoAction } from "../../../actions/seekerProfile";
import styles from "./edit.module.css";

type LocationPref = "remote" | "on_site" | "either";
type HousingPref = "preferred" | "not_needed";
type MealsPref = "required" | "preferred" | "not_needed" | "flexible";
type PayUnit = "hour" | "day" | "week" | "month" | "year" | "stipend" | "exchange" | "other";

export interface ProfileEditInitial {
  readonly seekerProfileId: string | null;
  readonly profilePhotoUrl: string;
  readonly displayName: string;
  readonly bio: string;
  readonly openToStatement: string;
  readonly locationPref: LocationPref | null;
  readonly housingPref: HousingPref | null;
  readonly mealsPref: MealsPref | null;
  readonly payExpectationMinDollars: string;
  readonly payExpectationMaxDollars: string;
  readonly payExpectationUnit: PayUnit;
  readonly payFlexible: boolean;
  readonly categories: string[];
  readonly freeformSkills: string[];
}

const MAX_TAGS = 10;

const LOCATION_OPTIONS: ReadonlyArray<{ value: LocationPref; label: string }> = [
  { value: "remote", label: "Remote" },
  { value: "on_site", label: "On-site" },
  { value: "either", label: "Either" },
];

const HOUSING_OPTIONS: ReadonlyArray<{ value: HousingPref; label: string }> = [
  { value: "preferred", label: "Housing preferred" },
  { value: "not_needed", label: "Not needed" },
];

const MEALS_OPTIONS: ReadonlyArray<{ value: MealsPref; label: string }> = [
  { value: "required", label: "Meals required" },
  { value: "preferred", label: "Meals preferred" },
  { value: "not_needed", label: "Not needed" },
  { value: "flexible", label: "Flexible" },
];

const PAY_UNIT_OPTIONS: ReadonlyArray<{ value: PayUnit; label: string }> = [
  { value: "hour", label: "/ hour" },
  { value: "day", label: "/ day" },
  { value: "week", label: "/ week" },
  { value: "month", label: "/ month" },
  { value: "stipend", label: "stipend" },
  { value: "exchange", label: "exchange" },
];

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

const CATEGORY_ICON: Record<MarketplaceCategory, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

function isCategory(value: string): value is MarketplaceCategory {
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value);
}

export function ProfileEditForm({ initial }: { initial: ProfileEditInitial }) {
  const router = useRouter();
  const getToken = useOptionalGetToken();
  const [photoUrl, setPhotoUrl] = useState(initial.profilePhotoUrl);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [openToStatement, setOpenToStatement] = useState(initial.openToStatement);
  const [locationPref, setLocationPref] = useState<LocationPref | null>(
    initial.locationPref,
  );
  const [housingPref, setHousingPref] = useState<HousingPref | null>(
    initial.housingPref,
  );
  const [mealsPref, setMealsPref] = useState<MealsPref | null>(initial.mealsPref);
  const [payMin, setPayMin] = useState(initial.payExpectationMinDollars);
  const [payMax, setPayMax] = useState(initial.payExpectationMaxDollars);
  const [payUnit, setPayUnit] = useState<PayUnit>(initial.payExpectationUnit);
  const [payFlexible, setPayFlexible] = useState(initial.payFlexible);
  const [selected, setSelected] = useState<MarketplaceCategory[]>(
    initial.categories.filter(isCategory),
  );
  const [tags, setTags] = useState<string[]>(initial.freeformSkills);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  async function uploadPhoto(file: File): Promise<string> {
    if (!initial.seekerProfileId) {
      throw new Error("Profile not found — reload the page and try again.");
    }
    const token = await getToken();
    if (!token) {
      throw new Error("Your session has expired — sign in again.");
    }
    const url = await uploadProfilePhoto(token, initial.seekerProfileId, file, "seeker");
    await saveProfilePhotoAction(url);
    return url;
  }

  function toggleCategory(category: MarketplaceCategory) {
    setSaved(false);
    setSelected((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  function addTag() {
    const tag = draft.trim();
    if (!tag) {
      return;
    }
    setSaved(false);
    setTags((current) => {
      if (
        current.length >= MAX_TAGS ||
        current.some((value) => value.toLowerCase() === tag.toLowerCase())
      ) {
        return current;
      }
      return [...current, tag];
    });
    setDraft("");
  }

  function removeTag(tag: string) {
    setSaved(false);
    setTags((current) => current.filter((value) => value !== tag));
  }

  function save() {
    startTransition(async () => {
      const minCents = payMin.trim() ? Math.round(Number(payMin) * 100) : undefined;
      const maxCents = payMax.trim() ? Math.round(Number(payMax) * 100) : undefined;
      await saveOnboardingStep({
        displayName,
        bio,
        openToStatement: openToStatement.trim() || null,
        locationPref,
        housingPref,
        mealsPref,
        payExpectationMinCents: Number.isFinite(minCents) ? minCents : null,
        payExpectationMaxCents: Number.isFinite(maxCents) ? maxCents : null,
        payExpectationUnit: payUnit,
        payFlexible,
        categories: selected,
        freeformSkills: tags,
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className={styles.shell}>
      <div className={styles.form}>
        {initial.seekerProfileId ? (
          <div className={styles.field}>
            <span className={styles.label}>Profile photo</span>
            <ImageUpload
              label="Add a profile photo"
              currentUrl={photoUrl || undefined}
              uploader={uploadPhoto}
              onUpload={(url) => {
                setPhotoUrl(url);
                router.refresh();
              }}
              disabled={pending}
            />
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Display name</span>
          <input
            className={styles.input}
            type="text"
            value={displayName}
            onChange={(event) => {
              setSaved(false);
              setDisplayName(event.target.value);
            }}
            autoComplete="name"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Short bio</span>
          <textarea
            className={styles.textarea}
            value={bio}
            rows={4}
            onChange={(event) => {
              setSaved(false);
              setBio(event.target.value);
            }}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>What I'm looking for</span>
          <textarea
            className={styles.textarea}
            value={openToStatement}
            rows={2}
            placeholder="e.g. A farm stay in the Pacific Northwest for summer 2026"
            onChange={(event) => {
              setSaved(false);
              setOpenToStatement(event.target.value);
            }}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Pay expectation</span>
          <div className={styles.payRow}>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="1"
              placeholder="Min"
              value={payMin}
              onChange={(event) => { setSaved(false); setPayMin(event.target.value); }}
            />
            <span className={styles.payDash}>–</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="1"
              placeholder="Max"
              value={payMax}
              onChange={(event) => { setSaved(false); setPayMax(event.target.value); }}
            />
            <select
              className={styles.select}
              value={payUnit}
              onChange={(event) => { setSaved(false); setPayUnit(event.target.value as PayUnit); }}
            >
              {PAY_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={payFlexible}
              onChange={(event) => { setSaved(false); setPayFlexible(event.target.checked); }}
            />
            <span className={styles.checkLabel}>I'm flexible on pay</span>
          </label>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Location</span>
          <div className={styles.options}>
            {LOCATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  locationPref === option.value
                    ? styles.optionSelected
                    : styles.option
                }
                aria-pressed={locationPref === option.value}
                onClick={() => {
                  setSaved(false);
                  setLocationPref((current) =>
                    current === option.value ? null : option.value,
                  );
                }}
              >
                <span className={styles.optionLabel}>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Housing</span>
          <div className={styles.options}>
            {HOUSING_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  housingPref === option.value
                    ? styles.optionSelected
                    : styles.option
                }
                aria-pressed={housingPref === option.value}
                onClick={() => {
                  setSaved(false);
                  setHousingPref((current) =>
                    current === option.value ? null : option.value,
                  );
                }}
              >
                <span className={styles.optionLabel}>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Meals</span>
          <div className={styles.options}>
            {MEALS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  mealsPref === option.value
                    ? styles.optionSelected
                    : styles.option
                }
                aria-pressed={mealsPref === option.value}
                onClick={() => {
                  setSaved(false);
                  setMealsPref((current) =>
                    current === option.value ? null : option.value,
                  );
                }}
              >
                <span className={styles.optionLabel}>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Categories</span>
          <div className={styles.tagGrid}>
            {MARKETPLACE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={
                  selected.includes(category) ? styles.tagSelected : styles.tag
                }
                aria-pressed={selected.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                <Icon name={CATEGORY_ICON[category]} size={16} aria-hidden />
                {CATEGORY_LABEL[category]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>
            Your tags ({tags.length}/{MAX_TAGS})
          </span>
          <div className={styles.tagRow}>
            <input
              className={styles.input}
              type="text"
              value={draft}
              maxLength={40}
              placeholder="Add a skill or interest"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              disabled={tags.length >= MAX_TAGS}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={addTag}
              disabled={tags.length >= MAX_TAGS || draft.trim().length === 0}
            >
              Add
            </button>
          </div>
          {tags.length > 0 ? (
            <div className={styles.tagGrid}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles.tagSelected}
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  {tag} ✕
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push("/profile")}
          disabled={pending}
        >
          Back to profile
        </button>
        <span className={styles.status}>
          {saved ? "Saved" : pending ? "Saving…" : ""}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={save}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </footer>
    </div>
  );
}
