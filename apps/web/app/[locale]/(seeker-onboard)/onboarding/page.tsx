"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSeekerOnboarding } from "../../../../components/onboarding/SeekerOnboardingProvider";
import {
  SEEKING_TIMELINE_OPTIONS,
  type SeekerSeekingTimeline,
} from "../../../../components/onboarding/seekerOnboardingModel";
import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
import { stepHref, useOnboardingReturnTo } from "./returnTo";
import styles from "./onboarding.module.css";

export default function OnboardingStartPage() {
  const router = useRouter();
  const { draft, updateDraft } = useSeekerOnboarding();
  // Carried forward so a seeker sent here from Community lands back there.
  const returnTo = useOnboardingReturnTo();
  const [displayName, setDisplayName] = useState(draft.displayName);
  const [bio, setBio] = useState(draft.bio);
  const [relativeLocation, setRelativeLocation] = useState(
    draft.relativeLocation,
  );
  const [seekingTimeline, setSeekingTimeline] =
    useState<SeekerSeekingTimeline | null>(draft.seekingTimeline);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    startTransition(async () => {
      setSaveError(null);
      try {
        const result = await saveOnboardingStep({
          displayName,
          bio,
          relativeLocation,
          seekingTimeline,
        });
        if (!result.ok) {
          setSaveError("We couldn’t save your profile. Please try again.");
          return;
        }
        updateDraft({
          displayName,
          bio,
          relativeLocation,
          seekingTimeline,
        });
        router.push(stepHref("/onboarding/prefs", returnTo));
      } catch {
        setSaveError("We couldn’t save your profile. Please try again.");
      }
    });
  }

  return (
    <div className={styles.shell}>
      <p className={styles.progressLabel}>Step 1 of 4 · About you</p>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={1}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={step <= 1 ? styles.progressDotActive : styles.progressDot}
            aria-hidden="true"
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>Build the profile behind your next season</h1>
        <p className={styles.sub}>
          Start with the details hosts need to understand your application. You
          can leave any field for later; we will tell you exactly what still
          blocks applying.
        </p>
      </header>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Display name</span>
          <input
            className={styles.input}
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How should hosts address you?"
            autoComplete="name"
            maxLength={80}
            disabled={pending}
          />
          <span className={styles.fieldHint}>Hosts see this on your application.</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Where are you based?</span>
          <input
            className={styles.input}
            type="text"
            value={relativeLocation}
            onChange={(event) => setRelativeLocation(event.target.value)}
            placeholder="e.g. Bend, Oregon"
            autoComplete="address-level2"
            maxLength={160}
            disabled={pending}
          />
          <span className={styles.fieldHint}>
            A general location is enough. Hosts use it to plan travel.
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>When could you start?</span>
          <select
            className={styles.select}
            value={seekingTimeline ?? ""}
            onChange={(event) =>
              setSeekingTimeline(
                (event.target.value as SeekerSeekingTimeline) || null,
              )
            }
            disabled={pending}
          >
            <option value="">Choose a window</option>
            {SEEKING_TIMELINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint}>
            This is required before applying and helps hosts judge timing.
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Short bio</span>
          <textarea
            className={styles.textarea}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="A sentence or two about what you're looking for."
            rows={4}
            maxLength={1000}
            disabled={pending}
          />
          <span className={styles.fieldHint}>
            A short bio or one work experience is required before applying.
          </span>
        </label>
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
          onClick={() => router.push(stepHref("/onboarding/prefs", returnTo))}
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
