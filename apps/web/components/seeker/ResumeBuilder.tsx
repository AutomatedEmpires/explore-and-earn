"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import type {
  SeekerResume,
  SeekerResumeExperience,
  SeekerResumeEducation,
  SeekerCertification,
} from "@explore-and-earn/db";

import {
  saveInfoAction,
  addExperienceAction,
  updateExperienceAction,
  deleteExperienceAction,
  addEducationAction,
  updateEducationAction,
  deleteEducationAction,
  addCertificationAction,
  updateCertificationAction,
  deleteCertificationAction,
} from "../../app/actions/resumeBuilder";
import { SeekerResumeCard } from "./SeekerResumeCard";
import { ResumeImport } from "./ResumeImport";
import styles from "./ResumeBuilder.module.css";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_EXPERIENCES = 3;
const MAX_SKILL_TAGS = 3;
const MAX_GENERAL_SKILLS = 10;

const CATEGORY_ICON: Record<MarketplaceCategory, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

const SEEKING_OPTIONS: { value: string; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "1_month", label: "1 month" },
  { value: "3_months", label: "3 months" },
  { value: "6_months", label: "6 months" },
];

const PREDEFINED_SKILLS = [
  "Guest Service",
  "Groundskeeping",
  "Animal Care",
  "Food Prep",
  "Housekeeping",
  "Maintenance",
  "Carpentry",
  "Equipment Operation",
  "Boating",
  "Fishing",
  "Farming",
  "Ranch Work",
  "Trail Work",
  "Guiding",
  "Leadership",
  "Teamwork",
  "Reliability",
  "Remote Living",
  "Cold Weather",
  "Heavy Lifting",
  "Safety Awareness",
  "Customer Communication",
  "Problem Solving",
  "Early Mornings",
  "Long Shifts",
];

type StepId = 0 | 1 | 2 | 3 | 4;

type BeforeLeaveBlockReason = "open_entry" | "save_failed";
type BeforeLeaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: BeforeLeaveBlockReason };

interface BeforeLeaveHandle {
  readonly beforeLeave: () => Promise<BeforeLeaveResult>;
  readonly willSave: boolean;
}

type RegisterBeforeLeave = (handle: BeforeLeaveHandle) => () => void;

const ALLOW_LEAVE: BeforeLeaveResult = { ok: true };
const BLOCK_OPEN_ENTRY: BeforeLeaveResult = {
  ok: false,
  reason: "open_entry",
};
const BLOCK_SAVE_FAILED: BeforeLeaveResult = {
  ok: false,
  reason: "save_failed",
};

const SAVE_ERROR_MESSAGE = "We couldn’t save your changes. Try again.";
const OPEN_ENTRY_MESSAGE =
  "Save or cancel the open entry before moving to another step.";

const STEPS: { label: string; icon: IconKey }[] = [
  { label: "Info", icon: "nav.profile" },
  { label: "Experience", icon: "analytics.trend" },
  { label: "Education", icon: "system.info" },
  { label: "Certs & Skills", icon: "status.match" },
  { label: "Review", icon: "action.apply" },
];

function useBeforeLeave(
  registerBeforeLeave: RegisterBeforeLeave,
  beforeLeave: BeforeLeaveHandle["beforeLeave"],
  willSave = false,
): void {
  const latestBeforeLeaveRef = useRef(beforeLeave);
  latestBeforeLeaveRef.current = beforeLeave;
  const invokeLatestBeforeLeave = useCallback(
    () => latestBeforeLeaveRef.current(),
    [],
  );

  useLayoutEffect(() => {
    const handle: BeforeLeaveHandle = {
      beforeLeave: invokeLatestBeforeLeave,
      willSave,
    };
    return registerBeforeLeave(handle);
  }, [invokeLatestBeforeLeave, registerBeforeLeave, willSave]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCategory(value: string): value is MarketplaceCategory {
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function formatDateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): string {
  const fmt = (d: string) => {
    const date = new Date(`${d}-01`);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };
  const s = start ? fmt(start) : null;
  const e = isCurrent ? "Present" : end ? fmt(end) : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  if (e) return e;
  return "";
}

function persistedCompletedSteps(resume: SeekerResume): Set<number> {
  const completed = new Set<number>();
  if (resume.profile?.bio || resume.profile?.displayName) completed.add(0);
  if (resume.experiences.length > 0) completed.add(1);
  if (resume.educations.length > 0) completed.add(2);
  if (
    resume.certifications.length > 0 ||
    (resume.profile?.generalSkills?.length ?? 0) > 0
  ) {
    completed.add(3);
  }
  return completed;
}

// ─── Step progress ──────────────────────────────────────────────────────────

interface CompletionRingProps {
  pct: number;
}

/* Live completion ring — mirrors the ResumeCallout ring on the seeker dashboard
   so the same "how done am I" signal reads consistently across surfaces. */
function CompletionRing({ pct }: CompletionRingProps) {
  const r = 19;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const dash = (clampedPct / 100) * circ;
  const complete = clampedPct >= 100;

  return (
    <div
      className={complete ? styles.ringWrapComplete : styles.ringWrap}
      role="progressbar"
      aria-label="Resume completion"
      aria-valuenow={clampedPct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={complete ? "Resume complete" : `${clampedPct}% complete`}
    >
      <svg className={styles.ring} viewBox="0 0 44 44" aria-hidden="true">
        <circle
          className={styles.ringTrack}
          cx="22"
          cy="22"
          r={r}
          fill="none"
        />
        <circle
          className={styles.ringValue}
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <span className={styles.ringPct}>
        {complete ? <Icon name="action.apply" size={20} aria-hidden /> : `${clampedPct}%`}
      </span>
    </div>
  );
}

interface StepProgressProps {
  current: StepId;
  completed: ReadonlySet<number>;
  completion: number;
  disabled: boolean;
  onStep: (step: StepId) => void;
}

/* Compact segmented stepper: a completion ring + a 5-node rail that never
   horizontally overflows (each node flexes equally). The current step is
   emphasized; finished steps carry a check. The active step's full title sits
   below the rail so labels never crowd the track on narrow screens. */
function StepProgress({
  current,
  completed,
  completion,
  disabled,
  onStep,
}: StepProgressProps) {
  const active = STEPS[current];
  const completionLabel =
    completion >= 100 ? "Resume complete" : `${completion}% complete`;

  return (
    <div className={styles.stepper}>
      <div className={styles.stepperTop}>
        <CompletionRing pct={completion} />
        <div className={styles.stepperHead}>
          <p className={styles.stepperStatus}>{completionLabel}</p>
          <p className={styles.stepperTitle}>
            <Icon name={active.icon} size={20} aria-hidden />
            {active.label}
          </p>
        </div>
        <span className={styles.stepperCount} aria-hidden="true">
          {current + 1}
          <span className={styles.stepperCountTotal}>/{STEPS.length}</span>
        </span>
      </div>

      <nav
        className={styles.rail}
        aria-label="Resume builder steps"
        aria-busy={disabled}
      >
        {STEPS.map((step, index) => {
          const isActive = index === current;
          const isDone = completed.has(index) && !isActive;
          const cls = isActive
            ? styles.nodeActive
            : isDone
              ? styles.nodeDone
              : styles.node;
          return (
            <button
              key={step.label}
              type="button"
              className={cls}
              onClick={() => { onStep(index as StepId); }}
              disabled={disabled}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${step.label}${isDone ? " (done)" : ""}`}
            >
              <span className={styles.nodeDot}>
                {isDone ? (
                  <Icon name="action.apply" size={16} aria-hidden />
                ) : (
                  <span className={styles.nodeNum}>{index + 1}</span>
                )}
              </span>
              <span className={styles.nodeLabel}>{step.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── TagBuilder ───────────────────────────────────────────────────────────────

interface TagBuilderProps {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}

function TagBuilder({
  tags,
  onChange,
  placeholder = "Add skill",
  max = MAX_SKILL_TAGS,
}: TagBuilderProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    if (!tag || tags.length >= max) return;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChange([...tags, tag]);
    }
    setDraft("");
  }

  return (
    <div className={styles.tagBuilderWrap}>
      <div className={styles.tagRow}>
        <input
          className={styles.input}
          type="text"
          value={draft}
          placeholder={placeholder}
          maxLength={40}
          onChange={(e) => { setDraft(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          disabled={tags.length >= max}
        />
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={add}
          disabled={tags.length >= max || !draft.trim()}
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className={styles.tagList}>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.tag}
              onClick={() => { onChange(tags.filter((x) => x !== t)); }}
              aria-label={`Remove ${t}`}
            >
              {t} ✕
            </button>
          ))}
        </div>
      )}
      {max > 0 && (
        <span className={styles.tagCount}>
          {tags.length}/{max}
        </span>
      )}
    </div>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

interface CategoryPickerProps {
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

function CategoryPicker({
  selected,
  disabled = false,
  onChange,
}: CategoryPickerProps) {
  function toggle(cat: MarketplaceCategory) {
    onChange(
      selected.includes(cat)
        ? selected.filter((c) => c !== cat)
        : [...selected, cat],
    );
  }

  return (
    <div className={styles.catGrid}>
      {MARKETPLACE_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={selected.includes(cat) ? styles.catSelected : styles.cat}
          aria-pressed={selected.includes(cat)}
          onClick={() => { toggle(cat); }}
          disabled={disabled}
        >
          <Icon name={CATEGORY_ICON[cat]} size={16} aria-hidden />
          {CATEGORY_LABEL[cat]}
        </button>
      ))}
    </div>
  );
}

// ─── GeneralSkillsPicker ──────────────────────────────────────────────────────

interface GeneralSkillsPickerProps {
  selected: string[];
  customDraft: string;
  disabled?: boolean;
  onCustomDraftChange: (next: string) => void;
  onChange: (next: string[]) => void;
}

function GeneralSkillsPicker({
  selected,
  customDraft,
  disabled = false,
  onCustomDraftChange,
  onChange,
}: GeneralSkillsPickerProps) {
  const atMax = selected.length >= MAX_GENERAL_SKILLS;

  function togglePredefined(skill: string) {
    if (selected.includes(skill)) {
      onChange(selected.filter((s) => s !== skill));
    } else if (!atMax) {
      onChange([...selected, skill]);
    }
  }

  function addCustom() {
    const s = customDraft.trim();
    if (!s || atMax) return;
    if (!selected.some((x) => x.toLowerCase() === s.toLowerCase())) {
      onChange([...selected, s]);
    }
    onCustomDraftChange("");
  }

  return (
    <div className={styles.skillsPicker}>
      <div className={styles.skillsGrid}>
        {PREDEFINED_SKILLS.map((skill) => {
          const isSelected = selected.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              className={isSelected ? styles.skillBadgeSelected : styles.skillBadge}
              aria-pressed={isSelected}
              onClick={() => { togglePredefined(skill); }}
              disabled={disabled || (!isSelected && atMax)}
            >
              {skill}
            </button>
          );
        })}
      </div>
      <div className={styles.skillsCustomRow}>
        <input
          className={styles.input}
          type="text"
          value={customDraft}
          placeholder="Add custom skill…"
          maxLength={32}
          disabled={disabled || atMax}
          onChange={(e) => { onCustomDraftChange(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addCustom(); }
          }}
        />
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={addCustom}
          disabled={disabled || atMax || !customDraft.trim()}
        >
          Add
        </button>
        {customDraft ? (
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => { onCustomDraftChange(""); }}
            disabled={disabled}
          >
            Clear
          </button>
        ) : null}
      </div>
      {selected.length > 0 && (
        <div className={styles.tagList}>
          {selected.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.tag}
              onClick={() => { onChange(selected.filter((x) => x !== s)); }}
              aria-label={`Remove ${s}`}
              disabled={disabled}
            >
              {s} ✕
            </button>
          ))}
        </div>
      )}
      <span className={styles.tagCount}>{selected.length}/{MAX_GENERAL_SKILLS} selected</span>
    </div>
  );
}

// ─── ExperienceForm ───────────────────────────────────────────────────────────

interface ExperienceFormState {
  roleTitle: string;
  companyName: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  summary: string;
  categoryTags: string[];
  skillTags: string[];
}

function blankExperience(): ExperienceFormState {
  return {
    roleTitle: "",
    companyName: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    summary: "",
    categoryTags: [],
    skillTags: [],
  };
}

function fromExperience(exp: SeekerResumeExperience): ExperienceFormState {
  return {
    roleTitle: exp.roleTitle ?? "",
    companyName: exp.companyName ?? "",
    location: exp.location ?? "",
    startDate: exp.startDate ?? "",
    endDate: exp.endDate ?? "",
    isCurrent: exp.isCurrent,
    summary: exp.summary ?? "",
    categoryTags: [...exp.categoryTags],
    skillTags: [...exp.skillTags].slice(0, MAX_SKILL_TAGS),
  };
}

interface ExperienceFormProps {
  initial: ExperienceFormState;
  onSave: (state: ExperienceFormState) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}

function ExperienceForm({ initial, onSave, onCancel, pending }: ExperienceFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof ExperienceFormState>(key: K) =>
    (value: ExperienceFormState[K]) =>
      setState((s) => ({ ...s, [key]: value }));

  return (
    <fieldset
      className={`${styles.form} ${styles.editorFieldset}`}
      disabled={pending}
      aria-busy={pending}
    >
      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Role title</span>
          <input
            className={styles.input}
            type="text"
            value={state.roleTitle}
            placeholder="Tour guide, farmhand…"
            onChange={(e) => { set("roleTitle")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Employer / place</span>
          <input
            className={styles.input}
            type="text"
            value={state.companyName}
            placeholder="Company or farm name"
            onChange={(e) => { set("companyName")(e.target.value); }}
          />
        </label>
      </div>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Location</span>
        <input
          className={styles.input}
          type="text"
          value={state.location}
          placeholder="City, state or region"
          onChange={(e) => { set("location")(e.target.value); }}
        />
      </label>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Start</span>
          <input
            className={styles.input}
            type="month"
            value={state.startDate}
            onChange={(e) => { set("startDate")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>End</span>
          <input
            className={styles.input}
            type="month"
            value={state.endDate}
            disabled={state.isCurrent}
            onChange={(e) => { set("endDate")(e.target.value); }}
          />
        </label>
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={state.isCurrent}
          onChange={(e) => { set("isCurrent")(e.target.checked); }}
        />
        <span>Currently in this role</span>
      </label>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Summary</span>
        <textarea
          className={styles.textarea}
          value={state.summary}
          rows={3}
          placeholder="What you did, learned, or achieved…"
          onChange={(e) => { set("summary")(e.target.value); }}
        />
      </label>

      <div className={styles.formField}>
        <span className={styles.fieldLabel}>Work type</span>
        <CategoryPicker
          selected={state.categoryTags}
          onChange={(v) => { set("categoryTags")(v); }}
        />
      </div>

      <div className={styles.formField}>
        <span className={styles.fieldLabel}>
          Skill badges <span className={styles.fieldHint}>(up to 3)</span>
        </span>
        <TagBuilder
          tags={state.skillTags}
          onChange={(v) => { set("skillTags")(v); }}
          placeholder="e.g. tractor operation, guest services"
          max={MAX_SKILL_TAGS}
        />
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => { void onSave(state); }}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </fieldset>
  );
}

// ─── EducationForm ────────────────────────────────────────────────────────────

interface EducationFormState {
  institution: string;
  programOrDegree: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  skillTags: string[];
}

function blankEducation(): EducationFormState {
  return {
    institution: "",
    programOrDegree: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    skillTags: [],
  };
}

function fromEducation(edu: SeekerResumeEducation): EducationFormState {
  return {
    institution: edu.institution ?? "",
    programOrDegree: edu.programOrDegree ?? "",
    location: edu.location ?? "",
    startDate: edu.startDate ?? "",
    endDate: edu.endDate ?? "",
    isCurrent: edu.isCurrent,
    description: edu.description ?? "",
    skillTags: [...edu.skillTags].slice(0, MAX_SKILL_TAGS),
  };
}

interface EducationFormProps {
  initial: EducationFormState;
  onSave: (state: EducationFormState) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}

function EducationForm({ initial, onSave, onCancel, pending }: EducationFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof EducationFormState>(key: K) =>
    (value: EducationFormState[K]) =>
      setState((s) => ({ ...s, [key]: value }));

  return (
    <fieldset
      className={`${styles.form} ${styles.editorFieldset}`}
      disabled={pending}
      aria-busy={pending}
    >
      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>School / institution</span>
          <input
            className={styles.input}
            type="text"
            value={state.institution}
            placeholder="University, trade school…"
            onChange={(e) => { set("institution")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Degree / program</span>
          <input
            className={styles.input}
            type="text"
            value={state.programOrDegree}
            placeholder="B.S. Marine Biology"
            onChange={(e) => { set("programOrDegree")(e.target.value); }}
          />
        </label>
      </div>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Location</span>
        <input
          className={styles.input}
          type="text"
          value={state.location}
          placeholder="City, state or country"
          onChange={(e) => { set("location")(e.target.value); }}
        />
      </label>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Start</span>
          <input
            className={styles.input}
            type="month"
            value={state.startDate}
            onChange={(e) => { set("startDate")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>End / expected</span>
          <input
            className={styles.input}
            type="month"
            value={state.endDate}
            disabled={state.isCurrent}
            onChange={(e) => { set("endDate")(e.target.value); }}
          />
        </label>
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={state.isCurrent}
          onChange={(e) => { set("isCurrent")(e.target.checked); }}
        />
        <span>Currently enrolled</span>
      </label>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Notes</span>
        <textarea
          className={styles.textarea}
          value={state.description}
          rows={2}
          placeholder="Relevant coursework, highlights…"
          onChange={(e) => { set("description")(e.target.value); }}
        />
      </label>

      <div className={styles.formField}>
        <span className={styles.fieldLabel}>
          Skill badges <span className={styles.fieldHint}>(up to 3)</span>
        </span>
        <TagBuilder
          tags={state.skillTags}
          onChange={(v) => { set("skillTags")(v); }}
          max={MAX_SKILL_TAGS}
        />
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => { void onSave(state); }}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </fieldset>
  );
}

// ─── CertForm ─────────────────────────────────────────────────────────────────

interface CertFormState {
  name: string;
  issuingOrganization: string;
  issuedAt: string;
  expiresAt: string;
  doesNotExpire: boolean;
  description: string;
  credentialUrl: string;
  categoryTags: string[];
  skillTags: string[];
}

function blankCert(): CertFormState {
  return {
    name: "",
    issuingOrganization: "",
    issuedAt: "",
    expiresAt: "",
    doesNotExpire: false,
    description: "",
    credentialUrl: "",
    categoryTags: [],
    skillTags: [],
  };
}

function fromCert(cert: SeekerCertification): CertFormState {
  return {
    name: cert.name,
    issuingOrganization: cert.issuingOrganization ?? "",
    issuedAt: cert.issuedAt ?? "",
    expiresAt: cert.expiresAt ?? "",
    doesNotExpire: cert.doesNotExpire,
    description: cert.description ?? "",
    credentialUrl: cert.credentialUrl ?? "",
    categoryTags: [...cert.categoryTags],
    skillTags: [...cert.skillTags].slice(0, MAX_SKILL_TAGS),
  };
}

interface CertFormProps {
  initial: CertFormState;
  onSave: (state: CertFormState) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}

function CertForm({ initial, onSave, onCancel, pending }: CertFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof CertFormState>(key: K) =>
    (value: CertFormState[K]) =>
      setState((s) => ({ ...s, [key]: value }));

  return (
    <fieldset
      className={`${styles.form} ${styles.editorFieldset}`}
      disabled={pending}
      aria-busy={pending}
    >
      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Certification name</span>
          <input
            className={styles.input}
            type="text"
            value={state.name}
            placeholder="PADI Open Water, ServSafe…"
            onChange={(e) => { set("name")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Issuing organization</span>
          <input
            className={styles.input}
            type="text"
            value={state.issuingOrganization}
            onChange={(e) => { set("issuingOrganization")(e.target.value); }}
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Date acquired</span>
          <input
            className={styles.input}
            type="date"
            value={state.issuedAt}
            onChange={(e) => { set("issuedAt")(e.target.value); }}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Expiration date</span>
          <input
            className={styles.input}
            type="date"
            value={state.expiresAt}
            disabled={state.doesNotExpire}
            onChange={(e) => { set("expiresAt")(e.target.value); }}
          />
        </label>
      </div>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={state.doesNotExpire}
          onChange={(e) => { set("doesNotExpire")(e.target.checked); }}
        />
        <span>Does not expire</span>
      </label>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Description <span className={styles.fieldHint}>(optional)</span></span>
        <textarea
          className={styles.textarea}
          value={state.description}
          rows={2}
          placeholder="What this certification covers…"
          onChange={(e) => { set("description")(e.target.value); }}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.fieldLabel}>Credential URL <span className={styles.fieldHint}>(optional)</span></span>
        <input
          className={styles.input}
          type="url"
          value={state.credentialUrl}
          placeholder="https://…"
          onChange={(e) => { set("credentialUrl")(e.target.value); }}
        />
      </label>

      <div className={styles.formField}>
        <span className={styles.fieldLabel}>
          Skill badges <span className={styles.fieldHint}>(up to 3)</span>
        </span>
        <TagBuilder
          tags={state.skillTags}
          onChange={(v) => { set("skillTags")(v); }}
          placeholder="e.g. safety, diving, first aid"
          max={MAX_SKILL_TAGS}
        />
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => { void onSave(state); }}
          disabled={pending || !state.name.trim()}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </fieldset>
  );
}

// ─── Step content components ──────────────────────────────────────────────────

interface InfoStepProps {
  resume: SeekerResume;
  onSaved: () => void;
  onSaveFailure: () => void;
  pending: boolean;
  registerBeforeLeave: RegisterBeforeLeave;
  startTransition: (fn: () => void) => void;
}

function InfoStep({
  resume,
  onSaved,
  onSaveFailure,
  pending,
  registerBeforeLeave,
  startTransition,
}: InfoStepProps) {
  const [displayName, setDisplayName] = useState(
    resume.profile?.displayName ?? "",
  );
  const [location, setLocation] = useState(resume.profile?.location ?? "");
  const [seekingTimeline, setSeekingTimeline] = useState(
    resume.profile?.seekingTimeline ?? "",
  );
  const [bio, setBio] = useState(resume.profile?.bio ?? "");
  const [categories, setCategories] = useState<string[]>(
    [...(resume.profile?.desiredCategories ?? [])],
  );
  const persistedDraftRef = useRef({
    displayName: resume.profile?.displayName ?? "",
    location: resume.profile?.location ?? "",
    seekingTimeline: resume.profile?.seekingTimeline ?? "",
    bio: resume.profile?.bio ?? "",
    categories: [...(resume.profile?.desiredCategories ?? [])],
  });
  const [saved, setSaved] = useState(false);
  const dirty =
    displayName !== persistedDraftRef.current.displayName ||
    location !== persistedDraftRef.current.location ||
    seekingTimeline !== persistedDraftRef.current.seekingTimeline ||
    bio !== persistedDraftRef.current.bio ||
    !sameStrings(categories, persistedDraftRef.current.categories);

  const persistInfo = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;

    try {
      const submitted = {
        displayName,
        location,
        seekingTimeline,
        bio,
        desiredCategories: [...categories],
      };
      const result = await saveInfoAction(submitted);
      if (!result.ok) return false;

      persistedDraftRef.current = {
        displayName: submitted.displayName,
        location: submitted.location,
        seekingTimeline: submitted.seekingTimeline,
        bio: submitted.bio,
        categories: submitted.desiredCategories,
      };
      setSaved(true);
      onSaved();
      return true;
    } catch {
      return false;
    }
  }, [bio, categories, dirty, displayName, location, onSaved, seekingTimeline]);

  const beforeLeave = useCallback(async (): Promise<BeforeLeaveResult> => {
    return (await persistInfo()) ? ALLOW_LEAVE : BLOCK_SAVE_FAILED;
  }, [persistInfo]);

  useBeforeLeave(registerBeforeLeave, beforeLeave, dirty);

  function handleSave() {
    startTransition(async () => {
      if (!(await persistInfo())) onSaveFailure();
    });
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIntro}>
        <p className={styles.stepDesc}>
          Hosts see this first. Tell them who you are and when you&apos;re available.
        </p>
      </div>

      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.formField}>
            <span className={styles.fieldLabel}>Full name</span>
            <input
              className={styles.input}
              type="text"
              value={displayName}
              placeholder="Your display name"
              disabled={pending}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.fieldLabel}>Location</span>
            <input
              className={styles.input}
              type="text"
              value={location}
              placeholder="City, state or region"
              disabled={pending}
              onChange={(e) => {
                setLocation(e.target.value);
                setSaved(false);
              }}
            />
          </label>
        </div>

        <div className={styles.formField}>
          <span className={styles.fieldLabel}>Seeking timeline</span>
          <div className={styles.segmentedControl} role="group" aria-label="Seeking timeline">
            {SEEKING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  seekingTimeline === opt.value
                    ? styles.segmentActive
                    : styles.segment
                }
                aria-pressed={seekingTimeline === opt.value}
                onClick={() => {
                  if (seekingTimeline === opt.value) return;
                  setSeekingTimeline(opt.value);
                  setSaved(false);
                }}
                disabled={pending}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.formField}>
          <span className={styles.fieldLabel}>Bio</span>
          <textarea
            className={styles.textarea}
            value={bio}
            rows={4}
            placeholder="What kind of work excites you? What&#39;s your story?"
            disabled={pending}
            onChange={(e) => {
              setBio(e.target.value);
              setSaved(false);
            }}
          />
        </label>

        <div className={styles.formField}>
          <span className={styles.fieldLabel}>
            Work interests <span className={styles.fieldHint}>(pick all that apply)</span>
          </span>
          <CategoryPicker
            selected={categories}
            disabled={pending}
            onChange={(v) => {
              setCategories(v);
              setSaved(false);
            }}
          />
        </div>

        <div className={styles.formActions}>
          <span className={styles.saveStatus}>
            {saved ? "Saved ✓" : pending ? "Saving…" : ""}
          </span>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={pending || !dirty}
          >
            Save info
          </button>
        </div>
      </div>
    </div>
  );
}

interface ExperienceStepProps {
  resume: SeekerResume;
  router: ReturnType<typeof useRouter>;
  pending: boolean;
  registerBeforeLeave: RegisterBeforeLeave;
  startTransition: (fn: () => void) => void;
}

function ExperienceStep({
  resume,
  router,
  pending,
  registerBeforeLeave,
  startTransition,
}: ExperienceStepProps) {
  const [expEditing, setExpEditing] = useState<string | null>(null);
  const [expAdding, setExpAdding] = useState(false);
  const atMax = resume.experiences.length >= MAX_EXPERIENCES;

  const beforeLeave = useCallback(async (): Promise<BeforeLeaveResult> => {
    return expAdding || expEditing !== null
      ? BLOCK_OPEN_ENTRY
      : ALLOW_LEAVE;
  }, [expAdding, expEditing]);

  useBeforeLeave(registerBeforeLeave, beforeLeave);

  function handleAdd(state: ExperienceFormState) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await addExperienceAction({
          roleTitle: state.roleTitle.trim() || undefined,
          companyName: state.companyName.trim() || undefined,
          location: state.location.trim() || null,
          startDate: state.startDate || null,
          endDate: state.isCurrent ? null : (state.endDate || null),
          isCurrent: state.isCurrent,
          summary: state.summary.trim() || undefined,
          categoryTags: state.categoryTags.filter(isCategory),
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setExpAdding(false); router.refresh(); }
        resolve();
      });
    });
  }

  function handleUpdate(id: string, state: ExperienceFormState) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await updateExperienceAction(id, {
          roleTitle: state.roleTitle.trim() || undefined,
          companyName: state.companyName.trim() || undefined,
          location: state.location.trim() || null,
          startDate: state.startDate || null,
          endDate: state.isCurrent ? null : (state.endDate || null),
          isCurrent: state.isCurrent,
          summary: state.summary.trim() || undefined,
          categoryTags: state.categoryTags.filter(isCategory),
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setExpEditing(null); router.refresh(); }
        resolve();
      });
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this experience?")) return;
    startTransition(async () => {
      const result = await deleteExperienceAction(id);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionMeta}>
          <h2 className={styles.sectionTitle}>Experience</h2>
          <span className={styles.sectionBadge}>Required · 1–3 entries</span>
        </div>
        {!expAdding && !atMax && (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => { setExpEditing(null); setExpAdding(true); }}
          >
            <Icon name="action.apply" size={16} aria-hidden /> Add
          </button>
        )}
      </div>

      {atMax && (
        <p className={styles.limitNote}>
          <Icon name="system.info" size={16} aria-hidden />
          Max 3 entries — keeps your resume focused and host-friendly.
        </p>
      )}

      {resume.experiences.length === 0 && !expAdding && (
        <p className={styles.emptyHint}>
          Add your work history — farm stays, seasonal jobs, remote gigs, anything relevant.
        </p>
      )}

      {resume.experiences.map((exp) => (
        <div key={exp.id} className={styles.card}>
          {expEditing === exp.id ? (
            <ExperienceForm
              initial={fromExperience(exp)}
              onSave={(s) => handleUpdate(exp.id, s)}
              onCancel={() => { setExpEditing(null); }}
              pending={pending}
            />
          ) : (
            <div className={styles.cardContent}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{exp.roleTitle ?? "Role"}</p>
                <p className={styles.cardSub}>
                  {[exp.companyName, exp.location, formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {exp.summary && <p className={styles.cardText}>{exp.summary}</p>}
                {(exp.categoryTags.length > 0 || exp.skillTags.length > 0) && (
                  <div className={styles.tagList}>
                    {exp.categoryTags.map((t) => (
                      <span key={t} className={styles.tagCategory}>{t}</span>
                    ))}
                    {exp.skillTags.map((t) => (
                      <span key={t} className={styles.tagReadOnly}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => { setExpAdding(false); setExpEditing(exp.id); }}
                  aria-label="Edit"
                >
                  <Icon name="action.more" size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  onClick={() => { handleDelete(exp.id); }}
                  aria-label="Delete"
                >
                  <Icon name="action.close" size={16} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {expAdding && (
        <div className={styles.card}>
          <ExperienceForm
            initial={blankExperience()}
            onSave={handleAdd}
            onCancel={() => { setExpAdding(false); }}
            pending={pending}
          />
        </div>
      )}
    </div>
  );
}

interface EducationStepProps {
  resume: SeekerResume;
  router: ReturnType<typeof useRouter>;
  pending: boolean;
  registerBeforeLeave: RegisterBeforeLeave;
  startTransition: (fn: () => void) => void;
}

function EducationStep({
  resume,
  router,
  pending,
  registerBeforeLeave,
  startTransition,
}: EducationStepProps) {
  const [eduEditing, setEduEditing] = useState<string | null>(null);
  const [eduAdding, setEduAdding] = useState(false);

  const beforeLeave = useCallback(async (): Promise<BeforeLeaveResult> => {
    return eduAdding || eduEditing !== null
      ? BLOCK_OPEN_ENTRY
      : ALLOW_LEAVE;
  }, [eduAdding, eduEditing]);

  useBeforeLeave(registerBeforeLeave, beforeLeave);

  function handleAdd(state: EducationFormState) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await addEducationAction({
          institution: state.institution.trim() || undefined,
          programOrDegree: state.programOrDegree.trim() || undefined,
          location: state.location.trim() || null,
          startDate: state.startDate || null,
          endDate: state.isCurrent ? null : (state.endDate || null),
          isCurrent: state.isCurrent,
          description: state.description.trim() || undefined,
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setEduAdding(false); router.refresh(); }
        resolve();
      });
    });
  }

  function handleUpdate(id: string, state: EducationFormState) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await updateEducationAction(id, {
          institution: state.institution.trim() || undefined,
          programOrDegree: state.programOrDegree.trim() || undefined,
          location: state.location.trim() || null,
          startDate: state.startDate || null,
          endDate: state.isCurrent ? null : (state.endDate || null),
          isCurrent: state.isCurrent,
          description: state.description.trim() || undefined,
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setEduEditing(null); router.refresh(); }
        resolve();
      });
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this education entry?")) return;
    startTransition(async () => {
      const result = await deleteEducationAction(id);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionMeta}>
          <h2 className={styles.sectionTitle}>Education</h2>
          <span className={styles.sectionBadgeOptional}>Optional</span>
        </div>
        {!eduAdding && (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => { setEduEditing(null); setEduAdding(true); }}
          >
            <Icon name="action.apply" size={16} aria-hidden /> Add
          </button>
        )}
      </div>

      {resume.educations.length === 0 && !eduAdding && (
        <p className={styles.emptyHint}>
          Add schools, trade programs, online courses — anything that shaped you.
        </p>
      )}

      {resume.educations.map((edu) => (
        <div key={edu.id} className={styles.card}>
          {eduEditing === edu.id ? (
            <EducationForm
              initial={fromEducation(edu)}
              onSave={(s) => handleUpdate(edu.id, s)}
              onCancel={() => { setEduEditing(null); }}
              pending={pending}
            />
          ) : (
            <div className={styles.cardContent}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{edu.programOrDegree ?? "Program"}</p>
                <p className={styles.cardSub}>
                  {[edu.institution, edu.location, formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {edu.description && <p className={styles.cardText}>{edu.description}</p>}
                {edu.skillTags.length > 0 && (
                  <div className={styles.tagList}>
                    {edu.skillTags.map((t) => (
                      <span key={t} className={styles.tagReadOnly}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => { setEduAdding(false); setEduEditing(edu.id); }}
                  aria-label="Edit"
                >
                  <Icon name="action.more" size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  onClick={() => { handleDelete(edu.id); }}
                  aria-label="Delete"
                >
                  <Icon name="action.close" size={16} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {eduAdding && (
        <div className={styles.card}>
          <EducationForm
            initial={blankEducation()}
            onSave={handleAdd}
            onCancel={() => { setEduAdding(false); }}
            pending={pending}
          />
        </div>
      )}
    </div>
  );
}

interface CertsSkillsStepProps {
  resume: SeekerResume;
  router: ReturnType<typeof useRouter>;
  onSaved: () => void;
  onSaveFailure: () => void;
  pending: boolean;
  registerBeforeLeave: RegisterBeforeLeave;
  startTransition: (fn: () => void) => void;
}

function CertsSkillsStep({
  resume,
  router,
  onSaved,
  onSaveFailure,
  pending,
  registerBeforeLeave,
  startTransition,
}: CertsSkillsStepProps) {
  const [certEditing, setCertEditing] = useState<string | null>(null);
  const [certAdding, setCertAdding] = useState(false);
  const [generalSkills, setGeneralSkills] = useState<string[]>(
    [...(resume.profile?.generalSkills ?? [])],
  );
  const [customSkillDraft, setCustomSkillDraft] = useState("");
  const persistedSkillsRef = useRef([
    ...(resume.profile?.generalSkills ?? []),
  ]);
  const [skillsSaved, setSkillsSaved] = useState(false);
  const skillsDirty = !sameStrings(generalSkills, persistedSkillsRef.current);

  const persistSkills = useCallback(async (): Promise<boolean> => {
    if (!skillsDirty) return true;

    try {
      const submitted = generalSkills.slice(0, MAX_GENERAL_SKILLS);
      const result = await saveInfoAction({ generalSkills: submitted });
      if (!result.ok) return false;

      persistedSkillsRef.current = submitted;
      setSkillsSaved(true);
      onSaved();
      return true;
    } catch {
      return false;
    }
  }, [generalSkills, onSaved, skillsDirty]);

  const beforeLeave = useCallback(async (): Promise<BeforeLeaveResult> => {
    if (certAdding || certEditing !== null || customSkillDraft.trim()) {
      return BLOCK_OPEN_ENTRY;
    }
    return (await persistSkills()) ? ALLOW_LEAVE : BLOCK_SAVE_FAILED;
  }, [certAdding, certEditing, customSkillDraft, persistSkills]);

  useBeforeLeave(
    registerBeforeLeave,
    beforeLeave,
    skillsDirty && !certAdding && certEditing === null && !customSkillDraft.trim(),
  );

  function handleAddCert(state: CertFormState) {
    if (!state.name.trim()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await addCertificationAction({
          name: state.name.trim(),
          issuingOrganization: state.issuingOrganization.trim() || undefined,
          issuedAt: state.issuedAt || null,
          expiresAt: state.doesNotExpire ? null : (state.expiresAt || null),
          doesNotExpire: state.doesNotExpire,
          description: state.description.trim() || null,
          credentialUrl: state.credentialUrl.trim() || undefined,
          categoryTags: state.categoryTags.filter(isCategory),
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setCertAdding(false); router.refresh(); }
        resolve();
      });
    });
  }

  function handleUpdateCert(id: string, state: CertFormState) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await updateCertificationAction(id, {
          name: state.name.trim() || undefined,
          issuingOrganization: state.issuingOrganization.trim() || undefined,
          issuedAt: state.issuedAt || null,
          expiresAt: state.doesNotExpire ? null : (state.expiresAt || null),
          doesNotExpire: state.doesNotExpire,
          description: state.description.trim() || null,
          credentialUrl: state.credentialUrl.trim() || undefined,
          categoryTags: state.categoryTags.filter(isCategory),
          skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
        });
        if (result.ok) { setCertEditing(null); router.refresh(); }
        resolve();
      });
    });
  }

  function handleDeleteCert(id: string) {
    if (!confirm("Delete this certification?")) return;
    startTransition(async () => {
      const result = await deleteCertificationAction(id);
      if (result.ok) router.refresh();
    });
  }

  function saveSkills() {
    startTransition(async () => {
      if (!(await persistSkills())) onSaveFailure();
    });
  }

  return (
    <div className={styles.stepContent}>
      {/* Certifications */}
      <div className={styles.sectionHead}>
        <div className={styles.sectionMeta}>
          <h2 className={styles.sectionTitle}>Certifications</h2>
          <span className={styles.sectionBadgeOptional}>Boost match</span>
        </div>
        {!certAdding && (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => { setCertEditing(null); setCertAdding(true); }}
          >
            <Icon name="action.apply" size={16} aria-hidden /> Add
          </button>
        )}
      </div>

      {resume.certifications.length === 0 && !certAdding && (
        <p className={styles.emptyHint}>
          PADI, CPR/First Aid, food handler, forklift — certifications build host confidence fast.
        </p>
      )}

      {resume.certifications.map((cert) => (
        <div key={cert.id} className={styles.card}>
          {certEditing === cert.id ? (
            <CertForm
              initial={fromCert(cert)}
              onSave={(s) => handleUpdateCert(cert.id, s)}
              onCancel={() => { setCertEditing(null); }}
              pending={pending}
            />
          ) : (
            <div className={styles.cardContent}>
              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{cert.name}</p>
                <p className={styles.cardSub}>
                  {[
                    cert.issuingOrganization,
                    cert.issuedAt
                      ? new Date(cert.issuedAt).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : null,
                    cert.doesNotExpire
                      ? "No expiry"
                      : cert.expiresAt
                        ? `Expires ${new Date(cert.expiresAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {cert.description && <p className={styles.cardText}>{cert.description}</p>}
                {cert.skillTags.length > 0 && (
                  <div className={styles.tagList}>
                    {cert.skillTags.map((t) => (
                      <span key={t} className={styles.tagReadOnly}>{t}</span>
                    ))}
                  </div>
                )}
                {cert.credentialUrl && (
                  <a
                    href={cert.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.credLink}
                  >
                    View credential <Icon name="action.forward" size={16} aria-hidden />
                  </a>
                )}
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => { setCertAdding(false); setCertEditing(cert.id); }}
                  aria-label="Edit"
                >
                  <Icon name="action.more" size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  onClick={() => { handleDeleteCert(cert.id); }}
                  aria-label="Delete"
                >
                  <Icon name="action.close" size={16} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {certAdding && (
        <div className={styles.card}>
          <CertForm
            initial={blankCert()}
            onSave={handleAddCert}
            onCancel={() => { setCertAdding(false); }}
            pending={pending}
          />
        </div>
      )}

      {/* General Skills */}
      <div className={styles.skillsDivider} />
      <div className={styles.sectionHead}>
        <div className={styles.sectionMeta}>
          <h2 className={styles.sectionTitle}>Skills</h2>
          <span className={styles.sectionBadgeOptional}>Up to 10</span>
        </div>
      </div>
      <p className={styles.emptyHint}>
        Pick predefined skills or add your own. These appear as a badge cloud on your resume.
      </p>

      <div className={styles.card}>
        <div className={styles.form}>
          <GeneralSkillsPicker
            selected={generalSkills}
            customDraft={customSkillDraft}
            disabled={pending}
            onCustomDraftChange={setCustomSkillDraft}
            onChange={(v) => {
              setGeneralSkills(v);
              setSkillsSaved(false);
            }}
          />
          <div className={styles.formActions}>
            <span className={styles.saveStatus}>
              {skillsSaved ? "Saved ✓" : pending ? "Saving…" : ""}
            </span>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={saveSkills}
              disabled={pending || !skillsDirty}
            >
              Save skills
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ResumeBuilder ────────────────────────────────────────────────────────

export interface ResumeBuilderProps {
  readonly resume: SeekerResume;
  readonly completion: number;
}

export function ResumeBuilder({ resume, completion }: ResumeBuilderProps) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [step, setStep] = useState<StepId>(0);
  const [navigationPending, setNavigationPending] = useState(false);
  const [navigationAlert, setNavigationAlert] = useState<string | null>(null);
  const [stepWillSave, setStepWillSave] = useState(false);
  const beforeLeaveRef = useRef<BeforeLeaveHandle | null>(null);
  const navigationInFlightRef = useRef(false);
  const pending = transitionPending || navigationPending;
  const completed = persistedCompletedSteps(resume);

  const registerBeforeLeave = useCallback<RegisterBeforeLeave>((handle) => {
    beforeLeaveRef.current = handle;
    setStepWillSave(handle.willSave);

    return () => {
      if (beforeLeaveRef.current !== handle) return;
      beforeLeaveRef.current = null;
      setStepWillSave(false);
    };
  }, []);

  const showSaveFailure = useCallback(() => {
    setNavigationAlert(SAVE_ERROR_MESSAGE);
  }, []);

  const refreshResume = useCallback(() => {
    setNavigationAlert(null);
    router.refresh();
  }, [router]);

  const requestStep = useCallback(async (target: StepId): Promise<void> => {
    if (
      target === step ||
      transitionPending ||
      navigationInFlightRef.current
    ) {
      return;
    }

    navigationInFlightRef.current = true;
    setNavigationPending(true);
    setNavigationAlert(null);
    const beforeLeave = beforeLeaveRef.current?.beforeLeave;

    try {
      const result = beforeLeave ? await beforeLeave() : ALLOW_LEAVE;
      if (!result.ok) {
        setNavigationAlert(
          result.reason === "open_entry"
            ? OPEN_ENTRY_MESSAGE
            : SAVE_ERROR_MESSAGE,
        );
        return;
      }

      beforeLeaveRef.current = null;
      setStepWillSave(false);
      setStep(target);
    } catch {
      setNavigationAlert(SAVE_ERROR_MESSAGE);
    } finally {
      navigationInFlightRef.current = false;
      setNavigationPending(false);
    }
  }, [step, transitionPending]);

  const backLabel = stepWillSave ? "Save & back" : "Back";
  const continueLabel =
    step === 3
      ? stepWillSave
        ? "Save & review"
        : "Review resume"
      : stepWillSave
        ? "Save & continue"
        : "Continue";

  return (
    <div
      className={styles.builder}
      role="region"
      aria-label="Resume builder"
      aria-busy={pending}
    >
      {/* Fast start: import an existing résumé, review, then save into the steps */}
      <ResumeImport resume={resume} />

      {/* Progress + step rail */}
      <StepProgress
        current={step}
        completed={completed}
        completion={completion}
        disabled={pending}
        onStep={(target) => { void requestStep(target); }}
      />

      {/* Step panels */}
      {step === 0 && (
        <InfoStep
          resume={resume}
          pending={pending}
          registerBeforeLeave={registerBeforeLeave}
          startTransition={startTransition}
          onSaved={refreshResume}
          onSaveFailure={showSaveFailure}
        />
      )}
      {step === 1 && (
        <ExperienceStep
          resume={resume}
          router={router}
          pending={pending}
          registerBeforeLeave={registerBeforeLeave}
          startTransition={startTransition}
        />
      )}
      {step === 2 && (
        <EducationStep
          resume={resume}
          router={router}
          pending={pending}
          registerBeforeLeave={registerBeforeLeave}
          startTransition={startTransition}
        />
      )}
      {step === 3 && (
        <CertsSkillsStep
          resume={resume}
          router={router}
          onSaved={refreshResume}
          onSaveFailure={showSaveFailure}
          pending={pending}
          registerBeforeLeave={registerBeforeLeave}
          startTransition={startTransition}
        />
      )}
      {step === 4 && (
        <div className={styles.stepContent}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <h2 className={styles.sectionTitle}>Resume preview</h2>
            </div>
          </div>
          <p className={styles.stepDesc}>
            This is what hosts see when you apply.
          </p>
          <SeekerResumeCard resume={resume} />
        </div>
      )}

      {navigationAlert ? (
        <p className={styles.navigationError} role="alert">
          {navigationAlert}
        </p>
      ) : null}

      {/* Step footer nav — sticky on mobile so advancing is always reachable */}
      <nav
        className={styles.stepFooter}
        aria-label="Resume step actions"
        aria-busy={pending}
      >
        {step > 0 ? (
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => { void requestStep((step - 1) as StepId); }}
            disabled={pending}
          >
            <Icon name="action.back" size={16} aria-hidden /> {backLabel}
          </button>
        ) : (
          <span className={styles.stepCounter} aria-hidden="true">
            Step {step + 1} of {STEPS.length}
          </span>
        )}
        {step < 4 && (
          <button
            type="button"
            className={styles.continueBtn}
            onClick={() => { void requestStep((step + 1) as StepId); }}
            disabled={pending}
          >
            {continueLabel}
            <Icon name="action.forward" size={16} aria-hidden />
          </button>
        )}
      </nav>
    </div>
  );
}
