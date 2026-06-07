"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
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
      await saveOnboardingStep({ categories: selected, freeformSkills: tags });
      router.push("/onboarding/done");
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
          onClick={() => router.push("/onboarding/done")}
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
