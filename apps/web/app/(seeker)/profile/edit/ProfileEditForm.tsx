"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
import styles from "./edit.module.css";

type LocationPref = "remote" | "on_site" | "either";
type HousingPref = "preferred" | "not_needed";

export interface ProfileEditInitial {
  readonly displayName: string;
  readonly bio: string;
  readonly locationPref: LocationPref | null;
  readonly housingPref: HousingPref | null;
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
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [locationPref, setLocationPref] = useState<LocationPref | null>(
    initial.locationPref,
  );
  const [housingPref, setHousingPref] = useState<HousingPref | null>(
    initial.housingPref,
  );
  const [selected, setSelected] = useState<MarketplaceCategory[]>(
    initial.categories.filter(isCategory),
  );
  const [tags, setTags] = useState<string[]>(initial.freeformSkills);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

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
      await saveOnboardingStep({
        displayName,
        bio,
        locationPref,
        housingPref,
        categories: selected,
        freeformSkills: tags,
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Edit profile</h1>
        <p className={styles.sub}>Update your name, bio, and preferences.</p>
      </header>

      <div className={styles.form}>
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
