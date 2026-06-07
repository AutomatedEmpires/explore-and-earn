"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveOnboardingStep } from "../../actions/seekerOnboarding";
import styles from "./onboarding.module.css";

export default function OnboardingStartPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pending, startTransition] = useTransition();

  function goNext() {
    startTransition(async () => {
      await saveOnboardingStep({ displayName, bio });
      router.push("/onboarding/prefs");
    });
  }

  return (
    <div className={styles.shell}>
      <div className={styles.progress} aria-hidden>
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={step <= 1 ? styles.progressDotActive : styles.progressDot}
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>Welcome — let&apos;s set up your profile</h1>
        <p className={styles.sub}>
          Tell hosts who you are. You can skip anything and edit it later.
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
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Short bio</span>
          <textarea
            className={styles.textarea}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="A sentence or two about what you're looking for."
            rows={4}
          />
        </label>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push("/onboarding/prefs")}
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
