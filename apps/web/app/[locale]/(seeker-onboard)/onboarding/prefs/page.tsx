"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSeekerOnboarding } from "../../../../../components/onboarding/SeekerOnboardingProvider";
import type {
  SeekerBenefitPreference,
  SeekerRemotePreference,
} from "../../../../../components/onboarding/seekerOnboardingModel";
import { saveOnboardingStep } from "../../../../actions/seekerOnboarding";
import { stepHref, useOnboardingReturnTo } from "../returnTo";
import styles from "../onboarding.module.css";

const LOCATION_OPTIONS: ReadonlyArray<{
  value: SeekerRemotePreference;
  label: string;
  detail: string;
}> = [
  { value: "remote", label: "Remote", detail: "Work from anywhere." },
  { value: "on_site", label: "On-site", detail: "Live and work at the host." },
  { value: "hybrid", label: "Hybrid", detail: "Mix remote and on-site work." },
  { value: "any", label: "Any setting", detail: "I’m open to every arrangement." },
];

const HOUSING_OPTIONS: ReadonlyArray<{
  value: SeekerBenefitPreference;
  label: string;
  detail: string;
}> = [
  {
    value: "required",
    label: "Housing required",
    detail: "I need host-provided housing for an on-site role.",
  },
  {
    value: "preferred",
    label: "Housing preferred",
    detail: "I'd like a host to provide housing.",
  },
  { value: "not_needed", label: "Not needed", detail: "I'll arrange my own." },
  {
    value: "flexible",
    label: "Flexible",
    detail: "I can consider either arrangement.",
  },
];

const MEALS_OPTIONS: ReadonlyArray<{
  value: SeekerBenefitPreference;
  label: string;
  detail: string;
}> = [
  {
    value: "required",
    label: "Meals required",
    detail: "Meals need to be part of the role.",
  },
  {
    value: "preferred",
    label: "Meals preferred",
    detail: "Provided meals would make the season work better.",
  },
  {
    value: "not_needed",
    label: "Not needed",
    detail: "I can handle my own meals.",
  },
  {
    value: "flexible",
    label: "Flexible",
    detail: "I am open to either setup.",
  },
];

export default function OnboardingPrefsPage() {
  const router = useRouter();
  const { draft, updateDraft } = useSeekerOnboarding();
  const returnTo = useOnboardingReturnTo();
  const [remotePreference, setRemotePreference] =
    useState<SeekerRemotePreference | null>(draft.remotePreference);
  const [housingPref, setHousingPref] =
    useState<SeekerBenefitPreference | null>(draft.housingPref);
  const [mealsPref, setMealsPref] =
    useState<SeekerBenefitPreference | null>(draft.mealsPref);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    startTransition(async () => {
      setSaveError(null);
      try {
        const result = await saveOnboardingStep({
          remotePreference,
          housingPref,
          mealsPref,
        });
        if (!result.ok) {
          setSaveError("We couldn’t save your preferences. Please try again.");
          return;
        }
        updateDraft({ remotePreference, housingPref, mealsPref });
        router.push(stepHref("/onboarding/skills", returnTo));
      } catch {
        setSaveError("We couldn’t save your preferences. Please try again.");
      }
    });
  }

  return (
    <div className={styles.shell}>
      <p className={styles.progressLabel}>Step 2 of 4 · Your essentials</p>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={2}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={step <= 2 ? styles.progressDotActive : styles.progressDot}
            aria-hidden="true"
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>Your preferences</h1>
        <p className={styles.sub}>
          Tell us what makes a role workable. These answers improve matching;
          they never guarantee that a listing provides a benefit.
        </p>
      </header>
      <div className={styles.form}>
        <fieldset className={styles.field}>
          <legend className={styles.label}>Work setting</legend>
          <div className={styles.options}>
            {LOCATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  remotePreference === option.value
                    ? styles.optionSelected
                    : styles.option
                }
                aria-pressed={remotePreference === option.value}
                disabled={pending}
                onClick={() =>
                  setRemotePreference((current) =>
                    current === option.value ? null : option.value,
                  )
                }
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionDetail}>{option.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.field}>
          <legend className={styles.label}>Housing</legend>
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
                disabled={pending}
                onClick={() =>
                  setHousingPref((current) =>
                    current === option.value ? null : option.value,
                  )
                }
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionDetail}>{option.detail}</span>
              </button>
            ))}
          </div>
          <span className={styles.fieldHint}>
            Entitled hosts can see this need when reviewing your application.
          </span>
        </fieldset>
        <fieldset className={styles.field}>
          <legend className={styles.label}>Meals</legend>
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
                disabled={pending}
                onClick={() =>
                  setMealsPref((current) =>
                    current === option.value ? null : option.value,
                  )
                }
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionDetail}>{option.detail}</span>
              </button>
            ))}
          </div>
          <span className={styles.fieldHint}>
            Used for matching. Hosts do not receive your meals preference as a
            screening field.
          </span>
        </fieldset>
      </div>
      {saveError ? (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      ) : null}
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push(stepHref("/onboarding/skills", returnTo))}
          disabled={pending}
        >
          Do this later
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={goNext}
          disabled={pending}
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </footer>
    </div>
  );
}
