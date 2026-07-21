"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { saveOnboardingStep } from "../../../../actions/seekerOnboarding";
import styles from "../onboarding.module.css";

const MAX_TAGS = 10;

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

export default function OnboardingSkillsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<MarketplaceCategory[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleCategory(category: MarketplaceCategory) {
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
    setTags((current) => current.filter((value) => value !== tag));
  }

  function goNext() {
    startTransition(async () => {
      // Pass complete: true here so onboarding_complete is set server-side
      // on the server action, not in a useEffect on the done page.
      setSaveError(null);
      try {
        const result = await saveOnboardingStep({
          categories: selected,
          freeformSkills: tags,
          complete: true,
        });
        if (!result.ok) {
          setSaveError("We couldn’t finish your profile. Please try again.");
          return;
        }
        router.push("/onboarding/done");
      } catch {
        setSaveError("We couldn’t finish your profile. Please try again.");
      }
    });
  }

  function skip() {
    startTransition(async () => {
      // This is the final onboarding step, so Skip must still mark
      // onboarding_complete — otherwise a seeker who skips here lands on the
      // "You're all set!" page while onboarding_complete stays false, and the
      // (seeker) layout's gate bounces them straight back to /onboarding on
      // their next visit.
      setSaveError(null);
      try {
        const result = await saveOnboardingStep({ complete: true });
        if (!result.ok) {
          setSaveError("We couldn’t finish your profile. Please try again.");
          return;
        }
        router.push("/onboarding/done");
      } catch {
        setSaveError("We couldn’t finish your profile. Please try again.");
      }
    });
  }

  return (
    <div className={styles.shell}>
      <div className={styles.progress} aria-hidden>
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={step <= 3 ? styles.progressDotActive : styles.progressDot}
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>Skills &amp; interests</h1>
        <p className={styles.sub}>
          Pick the kinds of work you&apos;re drawn to, and add your own tags.
        </p>
      </header>
      <div className={styles.form}>
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
                disabled={pending}
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
              placeholder="e.g. animal care, carpentry, cooking"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              disabled={pending || tags.length >= MAX_TAGS}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={addTag}
              disabled={pending || tags.length >= MAX_TAGS || draft.trim().length === 0}
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
                  disabled={pending}
                >
                  {tag} ✕
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
          onClick={skip}
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
