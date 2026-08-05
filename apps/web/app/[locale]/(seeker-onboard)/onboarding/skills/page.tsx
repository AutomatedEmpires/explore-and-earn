"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { useSeekerOnboarding } from "../../../../../components/onboarding/SeekerOnboardingProvider";
import { saveOnboardingStep } from "../../../../actions/seekerOnboarding";
import { stepHref, useOnboardingReturnTo } from "../returnTo";
import styles from "../onboarding.module.css";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

function appendTag(tags: string[], input: string): string[] {
  const tag = input.trim();
  if (
    !tag ||
    tag.length > MAX_TAG_LENGTH ||
    tags.length >= MAX_TAGS ||
    tags.some((value) => value.toLowerCase() === tag.toLowerCase())
  ) {
    return tags;
  }
  return [...tags, tag];
}

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

interface TagEditorProps {
  readonly label: string;
  readonly hint: string;
  readonly placeholder: string;
  readonly tags: string[];
  readonly input: string;
  readonly pending: boolean;
  readonly onInput: (value: string) => void;
  readonly onTags: (values: string[]) => void;
}

function TagEditor({
  label,
  hint,
  placeholder,
  tags,
  input,
  pending,
  onInput,
  onTags,
}: TagEditorProps) {
  const hintId = useId();

  function addTag() {
    const next = appendTag(tags, input);
    if (next === tags) return;
    onTags(next);
    onInput("");
  }

  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {label} ({tags.length}/{MAX_TAGS})
      </legend>
      <span id={hintId} className={styles.fieldHint}>{hint}</span>
      <div className={styles.tagRow}>
        <input
          className={styles.input}
          type="text"
          value={input}
          maxLength={MAX_TAG_LENGTH}
          placeholder={placeholder}
          aria-label={`New ${label.toLowerCase()}`}
          aria-describedby={hintId}
          onChange={(event) => onInput(event.target.value)}
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
          className={styles.secondaryButton}
          onClick={addTag}
          aria-label={`Add ${label.toLowerCase()}`}
          disabled={pending || tags.length >= MAX_TAGS || input.trim().length === 0}
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
              onClick={() => onTags(tags.filter((value) => value !== tag))}
              aria-label={`Remove ${tag}`}
              disabled={pending}
            >
              {tag}
              <Icon name="action.close" size={14} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

export default function OnboardingSkillsPage() {
  const router = useRouter();
  const returnTo = useOnboardingReturnTo();
  const { draft, updateDraft } = useSeekerOnboarding();
  const [selected, setSelected] = useState<MarketplaceCategory[]>(
    draft.categories,
  );
  const [desiredRoles, setDesiredRoles] = useState<string[]>(draft.desiredRoles);
  const [generalSkills, setGeneralSkills] = useState<string[]>(
    draft.generalSkills,
  );
  const [roleInput, setRoleInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleCategory(category: MarketplaceCategory) {
    setSelected((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  function goNext() {
    startTransition(async () => {
      setSaveError(null);
      // Treat a filled tag input as part of the form even if the seeker did not
      // tap the adjacent Add button before continuing.
      const rolesToSave = appendTag(desiredRoles, roleInput);
      const skillsToSave = appendTag(generalSkills, skillInput);
      try {
        const result = await saveOnboardingStep({
          categories: selected,
          desiredRoles: rolesToSave,
          generalSkills: skillsToSave,
        });
        if (!result.ok) {
          setSaveError("We couldn’t save your skills. Please try again.");
          return;
        }
        updateDraft({
          categories: selected,
          desiredRoles: rolesToSave,
          generalSkills: skillsToSave,
        });
        router.push(stepHref("/onboarding/done", returnTo));
      } catch {
        setSaveError("We couldn’t save your skills. Please try again.");
      }
    });
  }

  return (
    <div className={styles.shell}>
      <p className={styles.progressLabel}>Step 3 of 4 · Work fit</p>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={3}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={step <= 3 ? styles.progressDotActive : styles.progressDot}
            aria-hidden="true"
          />
        ))}
      </div>
      <header className={styles.header}>
        <h1 className={styles.heading}>What kind of work fits you?</h1>
        <p className={styles.sub}>
          Interests shape discovery. Skills are the experience hosts rely on
          when they review an application.
        </p>
      </header>
      <div className={styles.form}>
        <fieldset className={styles.field}>
          <legend className={styles.label}>Explore categories</legend>
          <span className={styles.fieldHint}>
            Choose any lanes you want to see. You can change these later.
          </span>
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
        </fieldset>
        <TagEditor
          label="Roles you want"
          hint="Examples: ranch hand, line cook, guest services. These tune your matches."
          placeholder="Add a role"
          tags={desiredRoles}
          input={roleInput}
          pending={pending}
          onInput={setRoleInput}
          onTags={setDesiredRoles}
        />
        <TagEditor
          label="Skills you bring"
          hint="Add at least one skill to become eligible to apply."
          placeholder="e.g. animal care, carpentry, cooking"
          tags={generalSkills}
          input={skillInput}
          pending={pending}
          onInput={setSkillInput}
          onTags={setGeneralSkills}
        />
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
          onClick={goNext}
          disabled={pending}
        >
          Save and review later
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={goNext}
          disabled={pending}
        >
          {pending ? "Saving…" : "Review profile"}
        </button>
      </footer>
    </div>
  );
}
