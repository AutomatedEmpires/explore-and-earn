"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
import styles from "../onboarding.module.css";

type LocationPref = "remote" | "on_site" | "either";
type HousingPref = "preferred" | "not_needed";

const LOCATION_OPTIONS: ReadonlyArray<{
  value: LocationPref;
  label: string;
  detail: string;
}> = [
  { value: "remote", label: "Remote", detail: "Work from anywhere." },
  { value: "on_site", label: "On-site", detail: "Live and work at the host." },
  { value: "either", label: "Either", detail: "I&apos;m open to both." },
];

const HOUSING_OPTIONS: ReadonlyArray<{
  value: HousingPref;
  label: string;
  detail: string;
}> = [
  {
    value: "preferred",
    label: "Housing preferred",
    detail: "I&apos;d like a host to provide housing.",
  },
  { value: "not_needed", label: "Not needed", detail: "I&apos;ll arrange my own." },
];

export default function OnboardingPrefsPage() {
  const router = useRouter();
  const [locationPref, setLocationPref] = useState<LocationPref | null>(null);
  const [housingPref, setHousingPref] = useState<HousingPref | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    startTransition(async () => {
      await saveOnboardingStep({ locationPref, housingPref });
      router.push("/onboarding/skills");
    });
  }

  return (
    <div className={styles.shell}>
      <div className={styles.progress} aria-hidden>
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={step <= 2 ? styles.progressDotActive : styles.progressDot}
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>Your preferences</h1>
        <p className={styles.sub}>
          Where do you want to work, and do you need housing?
        </p>
      </header>
      <div className={styles.form}>
        <fieldset className={styles.field}>
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
                onClick={() =>
                  setLocationPref((current) =>
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
        </fieldset>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push("/onboarding/skills")}
          disabled={pending}
        >
          Skip
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
