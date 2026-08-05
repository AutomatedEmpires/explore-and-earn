"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useOptionalGetToken } from "../../../../../lib/useOptionalGetToken";


import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { uploadProfilePhoto } from "@explore-and-earn/db/client";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { ImageUpload } from "../../../../../components/ImageUpload";
import { saveOnboardingStep } from "../../../../actions/seekerOnboarding";
import { saveProfilePhotoAction } from "../../../../actions/seekerProfile";
import styles from "./edit.module.css";
import { parsePayInput } from "./profilePay";

type RemotePreference = "remote" | "on_site" | "hybrid" | "any";
type HousingPref = "required" | "preferred" | "not_needed" | "flexible";
type MealsPref = "required" | "preferred" | "not_needed" | "flexible";
type PayUnit = "hour" | "day" | "week" | "month" | "year" | "stipend" | "exchange" | "other";

export interface ProfileEditInitial {
  readonly seekerProfileId: string | null;
  readonly profilePhotoUrl: string;
  readonly displayName: string;
  readonly bio: string;
  readonly openToStatement: string;
  readonly remotePreference: RemotePreference | null;
  readonly housingPref: HousingPref | null;
  readonly mealsPref: MealsPref | null;
  readonly payExpectationMinDollars: string;
  readonly payExpectationMaxDollars: string;
  readonly payExpectationUnit: PayUnit;
  readonly payFlexible: boolean;
  readonly categories: string[];
  readonly desiredRoles: string[];
  readonly generalSkills: string[];
}

const MAX_TAGS = 10;

const REMOTE_OPTIONS: ReadonlyArray<{
  value: RemotePreference;
  label: string;
}> = [
  { value: "remote", label: "Remote" },
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "any", label: "Any setting" },
];

const HOUSING_OPTIONS: ReadonlyArray<{ value: HousingPref; label: string }> = [
  { value: "required", label: "Housing required" },
  { value: "preferred", label: "Housing preferred" },
  { value: "not_needed", label: "Not needed" },
  { value: "flexible", label: "Flexible" },
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
  { value: "year", label: "/ year" },
  { value: "stipend", label: "stipend" },
  { value: "exchange", label: "exchange" },
  { value: "other", label: "other" },
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

function appendTag(current: string[], input: string): string[] {
  const tag = input.trim();
  if (
    !tag ||
    tag.length > 40 ||
    current.length >= MAX_TAGS ||
    current.some((value) => value.toLowerCase() === tag.toLowerCase())
  ) {
    return current;
  }
  return [...current, tag];
}

export function ProfileEditForm({ initial }: { initial: ProfileEditInitial }) {
  const router = useRouter();
  const getToken = useOptionalGetToken();
  const [photoUrl, setPhotoUrl] = useState(initial.profilePhotoUrl);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [openToStatement, setOpenToStatement] = useState(initial.openToStatement);
  const [remotePreference, setRemotePreference] = useState<RemotePreference | null>(
    initial.remotePreference,
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
  const [desiredRoles, setDesiredRoles] = useState<string[]>(initial.desiredRoles);
  const [generalSkills, setGeneralSkills] = useState<string[]>(
    initial.generalSkills,
  );
  const [roleDraft, setRoleDraft] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    const result = await saveProfilePhotoAction(url);
    if (!result.ok) {
      throw new Error("Your photo uploaded, but we couldn’t save it to your profile. Try again.");
    }
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

  function addRole() {
    setSaved(false);
    setDesiredRoles((current) => appendTag(current, roleDraft));
    setRoleDraft("");
  }

  function addSkill() {
    setSaved(false);
    setGeneralSkills((current) => appendTag(current, skillDraft));
    setSkillDraft("");
  }

  function save() {
    startTransition(async () => {
      setSaved(false);
      setSaveError(null);
      const parsedMin = parsePayInput(payMin);
      const parsedMax = parsePayInput(payMax);
      if (!parsedMin.ok || !parsedMax.ok) {
        setSaveError(
          "Enter pay as a non-negative amount with no more than two decimal places.",
        );
        return;
      }
      const rolesToSave = appendTag(desiredRoles, roleDraft);
      const skillsToSave = appendTag(generalSkills, skillDraft);
      try {
        const result = await saveOnboardingStep({
          displayName,
          bio,
          openToStatement: openToStatement.trim() || null,
          remotePreference,
          housingPref,
          mealsPref,
          payExpectationMinCents: parsedMin.cents,
          payExpectationMaxCents: parsedMax.cents,
          payExpectationUnit: payUnit,
          payFlexible,
          categories: selected,
          desiredRoles: rolesToSave,
          generalSkills: skillsToSave,
        });
        if (!result.ok) {
          setSaveError("We couldn’t save your changes. Please try again.");
          return;
        }
        setDesiredRoles(rolesToSave);
        setGeneralSkills(skillsToSave);
        setRoleDraft("");
        setSkillDraft("");
        setSaved(true);
        router.refresh();
      } catch {
        setSaveError("We couldn’t save your changes. Please try again.");
      }
    });
  }

  return (
    <div className={styles.shell}>
      <fieldset className={styles.form} disabled={pending} aria-busy={pending}>
        <legend className={styles.srOnly}>Profile details</legend>
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
            maxLength={80}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Short bio</span>
          <textarea
            className={styles.textarea}
            value={bio}
            rows={4}
            maxLength={1000}
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
            maxLength={500}
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
              aria-label="Minimum pay"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Min"
              value={payMin}
              onChange={(event) => { setSaved(false); setPayMin(event.target.value); }}
            />
            <span className={styles.payDash}>–</span>
            <input
              className={styles.input}
              type="number"
              aria-label="Maximum pay"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Max"
              value={payMax}
              onChange={(event) => { setSaved(false); setPayMax(event.target.value); }}
            />
            <select
              className={styles.select}
              aria-label="Pay period"
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
          <span className={styles.label}>Work setting</span>
          <div className={styles.options}>
            {REMOTE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  remotePreference === option.value
                    ? styles.optionSelected
                    : styles.option
                }
                aria-pressed={remotePreference === option.value}
                onClick={() => {
                  setSaved(false);
                  setRemotePreference((current) =>
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
            Roles you want ({desiredRoles.length}/{MAX_TAGS})
          </span>
          <div className={styles.tagRow}>
            <input
              className={styles.input}
              type="text"
              value={roleDraft}
              maxLength={40}
              placeholder="e.g. ranch hand, line cook"
              aria-label="Role to add"
              onChange={(event) => setRoleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRole();
                }
              }}
              disabled={desiredRoles.length >= MAX_TAGS}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={addRole}
              aria-label="Add role"
              disabled={
                desiredRoles.length >= MAX_TAGS || roleDraft.trim().length === 0
              }
            >
              Add
            </button>
          </div>
          {desiredRoles.length > 0 ? (
            <div className={styles.tagGrid}>
              {desiredRoles.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles.tagSelected}
                  onClick={() => {
                    setSaved(false);
                    setDesiredRoles((current) =>
                      current.filter((value) => value !== tag),
                    );
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  {tag}
                  <Icon name="action.close" size={14} aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>
            Skills you bring ({generalSkills.length}/{MAX_TAGS})
          </span>
          <div className={styles.tagRow}>
            <input
              className={styles.input}
              type="text"
              value={skillDraft}
              maxLength={40}
              placeholder="e.g. animal care, carpentry, cooking"
              aria-label="Skill to add"
              onChange={(event) => setSkillDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSkill();
                }
              }}
              disabled={generalSkills.length >= MAX_TAGS}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={addSkill}
              aria-label="Add skill"
              disabled={
                generalSkills.length >= MAX_TAGS || skillDraft.trim().length === 0
              }
            >
              Add
            </button>
          </div>
          {generalSkills.length > 0 ? (
            <div className={styles.tagGrid}>
              {generalSkills.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles.tagSelected}
                  onClick={() => {
                    setSaved(false);
                    setGeneralSkills((current) =>
                      current.filter((value) => value !== tag),
                    );
                  }}
                  aria-label={`Remove ${tag}`}
                >
                  {tag}
                  <Icon name="action.close" size={14} aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </fieldset>

      {saveError ? (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      ) : null}

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push("/profile")}
          disabled={pending}
        >
          Back to profile
        </button>
        <span
          className={styles.status}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
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
