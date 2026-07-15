"use client";

import { useRef, useState, useTransition } from "react";
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
import {
  buildResumePreview,
  getResumeAdvanceLabel,
  type ResumePreviewDraft,
} from "./resumePreview";
import styles from "./ResumeBuilder.module.css";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_EXPERIENCES = 3;
const MAX_SKILL_TAGS = 3;
const MAX_GENERAL_SKILLS = 10;
const PREVIEW_EXPERIENCE_ID = "preview:experience";
const PREVIEW_EDUCATION_ID = "preview:education";
const PREVIEW_CERTIFICATION_ID = "preview:certification";

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

const STEPS: { label: string; icon: IconKey }[] = [
  { label: "Info", icon: "nav.profile" },
  { label: "Experience", icon: "analytics.trend" },
  { label: "Education", icon: "system.info" },
  { label: "Certs & Skills", icon: "status.match" },
  { label: "Review", icon: "action.apply" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCategory(value: string): value is MarketplaceCategory {
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value);
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

// ─── Step progress ──────────────────────────────────────────────────────────

interface CompletionRingProps {
  pct: number;
}

/* Live completion ring — mirrors the ResumeCallout ring on the seeker dashboard
   so the same "how done am I" signal reads consistently across surfaces. */
function CompletionRing({ pct }: CompletionRingProps) {
  const r = 19;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  const complete = pct >= 100;

  return (
    <div className={complete ? styles.ringWrapComplete : styles.ringWrap}>
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
        {complete ? <Icon name="action.apply" size={20} aria-hidden /> : `${pct}%`}
      </span>
    </div>
  );
}

interface StepProgressProps {
  current: StepId;
  completed: Set<number>;
  completion: number;
  onStep: (step: StepId) => void;
  disabled?: boolean;
}

/* Compact segmented stepper: a completion ring + a 5-node rail that never
   horizontally overflows (each node flexes equally). The current step is
   emphasized; finished steps carry a check. The active step's full title sits
   below the rail so labels never crowd the track on narrow screens. */
function StepProgress({
  current,
  completed,
  completion,
  onStep,
  disabled = false,
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

      <nav className={styles.rail} aria-label="Resume builder steps">
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
  onDraftInput?: () => void;
  placeholder?: string;
  max?: number;
}

function TagBuilder({
  tags,
  onChange,
  onDraftInput,
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
          onChange={(e) => {
            setDraft(e.target.value);
            onDraftInput?.();
          }}
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
  onChange: (next: string[]) => void;
}

function CategoryPicker({ selected, onChange }: CategoryPickerProps) {
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
          data-secondary={cat === "mix" ? true : undefined}
          aria-pressed={selected.includes(cat)}
          onClick={() => { toggle(cat); }}
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
  onChange: (next: string[]) => void;
  onDraftInput?: () => void;
}

function GeneralSkillsPicker({
  selected,
  onChange,
  onDraftInput,
}: GeneralSkillsPickerProps) {
  const [customDraft, setCustomDraft] = useState("");
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
    setCustomDraft("");
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
              disabled={!isSelected && atMax}
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
          disabled={atMax}
          onChange={(e) => {
            setCustomDraft(e.target.value);
            onDraftInput?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addCustom(); }
          }}
        />
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={addCustom}
          disabled={atMax || !customDraft.trim()}
        >
          Add
        </button>
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

function toExperiencePreview(
  state: ExperienceFormState,
  id: string,
): SeekerResumeExperience {
  return {
    id,
    roleTitle: state.roleTitle.trim() || null,
    companyName: state.companyName.trim() || null,
    location: state.location.trim() || null,
    startDate: state.startDate || null,
    endDate: state.isCurrent ? null : state.endDate || null,
    isCurrent: state.isCurrent,
    summary: state.summary.trim() || null,
    categoryTags: state.categoryTags.filter(isCategory),
    skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
  };
}

interface ExperienceFormProps {
  initial: ExperienceFormState;
  onSave: (state: ExperienceFormState) => Promise<void>;
  onCancel: () => void;
  onDraftChange: (state: ExperienceFormState) => void;
  pending: boolean;
}

function ExperienceForm({
  initial,
  onSave,
  onCancel,
  onDraftChange,
  pending,
}: ExperienceFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof ExperienceFormState>(key: K) =>
    (value: ExperienceFormState[K]) => {
      const next = { ...state, [key]: value };
      setState(next);
      onDraftChange(next);
    };

  return (
    <div className={styles.form}>
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
          onDraftInput={() => { onDraftChange(state); }}
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
    </div>
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

function toEducationPreview(
  state: EducationFormState,
  id: string,
): SeekerResumeEducation {
  return {
    id,
    institution: state.institution.trim() || null,
    programOrDegree: state.programOrDegree.trim() || null,
    location: state.location.trim() || null,
    startDate: state.startDate || null,
    endDate: state.isCurrent ? null : state.endDate || null,
    isCurrent: state.isCurrent,
    description: state.description.trim() || null,
    skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
  };
}

interface EducationFormProps {
  initial: EducationFormState;
  onSave: (state: EducationFormState) => Promise<void>;
  onCancel: () => void;
  onDraftChange: (state: EducationFormState) => void;
  pending: boolean;
}

function EducationForm({
  initial,
  onSave,
  onCancel,
  onDraftChange,
  pending,
}: EducationFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof EducationFormState>(key: K) =>
    (value: EducationFormState[K]) => {
      const next = { ...state, [key]: value };
      setState(next);
      onDraftChange(next);
    };

  return (
    <div className={styles.form}>
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
          onDraftInput={() => { onDraftChange(state); }}
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
    </div>
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

function toCertificationPreview(
  state: CertFormState,
  id: string,
): SeekerCertification {
  return {
    id,
    name: state.name.trim(),
    issuingOrganization: state.issuingOrganization.trim() || null,
    issuedAt: state.issuedAt || null,
    expiresAt: state.doesNotExpire ? null : state.expiresAt || null,
    doesNotExpire: state.doesNotExpire,
    description: state.description.trim() || null,
    credentialUrl: state.credentialUrl.trim() || null,
    categoryTags: state.categoryTags.filter(isCategory),
    skillTags: state.skillTags.slice(0, MAX_SKILL_TAGS),
  };
}

interface CertFormProps {
  initial: CertFormState;
  onSave: (state: CertFormState) => Promise<void>;
  onCancel: () => void;
  onDraftChange: (state: CertFormState) => void;
  pending: boolean;
}

function CertForm({
  initial,
  onSave,
  onCancel,
  onDraftChange,
  pending,
}: CertFormProps) {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof CertFormState>(key: K) =>
    (value: CertFormState[K]) => {
      const next = { ...state, [key]: value };
      setState(next);
      onDraftChange(next);
    };

  return (
    <div className={styles.form}>
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
          onDraftInput={() => { onDraftChange(state); }}
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
    </div>
  );
}

// ─── Step content components ──────────────────────────────────────────────────

type ProfilePreviewDraft = NonNullable<ResumePreviewDraft["profile"]>;

interface InfoStepProps {
  resume: SeekerResume;
  onSaved: () => void;
  onDraftChange: (draft: ProfilePreviewDraft) => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}

function InfoStep({
  resume,
  onSaved,
  onDraftChange,
  pending,
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
  const [saved, setSaved] = useState(false);

  function publishDraft(
    overrides: Partial<{
      displayName: string;
      location: string;
      seekingTimeline: string;
      bio: string;
      categories: string[];
    }>,
  ) {
    const next = {
      displayName,
      location,
      seekingTimeline,
      bio,
      categories,
      ...overrides,
    };
    const validTimeline = SEEKING_OPTIONS.some(
      (option) => option.value === next.seekingTimeline,
    );

    onDraftChange({
      displayName: next.displayName.trim() || null,
      location: next.location.trim() || null,
      seekingTimeline: validTimeline ? next.seekingTimeline : null,
      bio: next.bio.trim() || null,
      desiredCategories: next.categories.filter(isCategory),
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveInfoAction({
        displayName,
        location,
        seekingTimeline,
        bio,
        desiredCategories: categories,
      });
      if (result.ok) { setSaved(true); onSaved(); }
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
              onChange={(e) => {
                const value = e.target.value;
                setDisplayName(value);
                setSaved(false);
                publishDraft({ displayName: value });
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
              onChange={(e) => {
                const value = e.target.value;
                setLocation(value);
                setSaved(false);
                publishDraft({ location: value });
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
                  setSeekingTimeline(opt.value);
                  setSaved(false);
                  publishDraft({ seekingTimeline: opt.value });
                }}
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
            onChange={(e) => {
              const value = e.target.value;
              setBio(value);
              setSaved(false);
              publishDraft({ bio: value });
            }}
          />
        </label>

        <div className={styles.formField}>
          <span className={styles.fieldLabel}>
            Work interests <span className={styles.fieldHint}>(pick all that apply)</span>
          </span>
          <CategoryPicker
            selected={categories}
            onChange={(value) => {
              setCategories(value);
              setSaved(false);
              publishDraft({ categories: value });
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
            disabled={pending}
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
  onDraftChange: (draft: SeekerResumeExperience | undefined) => void;
  onSaved: () => void;
  startTransition: (fn: () => void) => void;
}

function ExperienceStep({
  resume,
  router,
  pending,
  onDraftChange,
  onSaved,
  startTransition,
}: ExperienceStepProps) {
  const [expEditing, setExpEditing] = useState<string | null>(null);
  const [expAdding, setExpAdding] = useState(false);
  const atMax = resume.experiences.length >= MAX_EXPERIENCES;

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
        if (result.ok) {
          setExpAdding(false);
          onDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
        if (result.ok) {
          setExpEditing(null);
          onDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
            onClick={() => {
              setExpEditing(null);
              setExpAdding(true);
              onDraftChange(undefined);
            }}
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
              onCancel={() => {
                setExpEditing(null);
                onDraftChange(undefined);
              }}
              onDraftChange={(state) => {
                onDraftChange(toExperiencePreview(state, exp.id));
              }}
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
                  onClick={() => {
                    setExpAdding(false);
                    setExpEditing(exp.id);
                    onDraftChange(undefined);
                  }}
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
            onCancel={() => {
              setExpAdding(false);
              onDraftChange(undefined);
            }}
            onDraftChange={(state) => {
              onDraftChange(
                toExperiencePreview(state, PREVIEW_EXPERIENCE_ID),
              );
            }}
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
  onDraftChange: (draft: SeekerResumeEducation | undefined) => void;
  onSaved: () => void;
  startTransition: (fn: () => void) => void;
}

function EducationStep({
  resume,
  router,
  pending,
  onDraftChange,
  onSaved,
  startTransition,
}: EducationStepProps) {
  const [eduEditing, setEduEditing] = useState<string | null>(null);
  const [eduAdding, setEduAdding] = useState(false);

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
        if (result.ok) {
          setEduAdding(false);
          onDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
        if (result.ok) {
          setEduEditing(null);
          onDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
            onClick={() => {
              setEduEditing(null);
              setEduAdding(true);
              onDraftChange(undefined);
            }}
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
              onCancel={() => {
                setEduEditing(null);
                onDraftChange(undefined);
              }}
              onDraftChange={(state) => {
                onDraftChange(toEducationPreview(state, edu.id));
              }}
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
                  onClick={() => {
                    setEduAdding(false);
                    setEduEditing(edu.id);
                    onDraftChange(undefined);
                  }}
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
            onCancel={() => {
              setEduAdding(false);
              onDraftChange(undefined);
            }}
            onDraftChange={(state) => {
              onDraftChange(toEducationPreview(state, PREVIEW_EDUCATION_ID));
            }}
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
  pending: boolean;
  onCertificationDraftChange: (
    draft: SeekerCertification | undefined,
  ) => void;
  onProfileDraftChange: (draft: ProfilePreviewDraft | undefined) => void;
  onSaved: () => void;
  startTransition: (fn: () => void) => void;
}

function CertsSkillsStep({
  resume,
  router,
  pending,
  onCertificationDraftChange,
  onProfileDraftChange,
  onSaved,
  startTransition,
}: CertsSkillsStepProps) {
  const [certEditing, setCertEditing] = useState<string | null>(null);
  const [certAdding, setCertAdding] = useState(false);
  const [generalSkills, setGeneralSkills] = useState<string[]>(
    [...(resume.profile?.generalSkills ?? [])],
  );
  const [skillsSaved, setSkillsSaved] = useState(false);

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
        if (result.ok) {
          setCertAdding(false);
          onCertificationDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
        if (result.ok) {
          setCertEditing(null);
          onCertificationDraftChange(undefined);
          onSaved();
          router.refresh();
        }
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
      const result = await saveInfoAction({
        generalSkills: generalSkills.slice(0, MAX_GENERAL_SKILLS),
      });
      if (result.ok) {
        setSkillsSaved(true);
        onProfileDraftChange(undefined);
        onSaved();
        router.refresh();
      }
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
            onClick={() => {
              setCertEditing(null);
              setCertAdding(true);
              onCertificationDraftChange(undefined);
            }}
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
              onCancel={() => {
                setCertEditing(null);
                onCertificationDraftChange(undefined);
              }}
              onDraftChange={(state) => {
                onCertificationDraftChange(
                  toCertificationPreview(state, cert.id),
                );
              }}
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
                  onClick={() => {
                    setCertAdding(false);
                    setCertEditing(cert.id);
                    onCertificationDraftChange(undefined);
                  }}
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
            onCancel={() => {
              setCertAdding(false);
              onCertificationDraftChange(undefined);
            }}
            onDraftChange={(state) => {
              onCertificationDraftChange(
                toCertificationPreview(state, PREVIEW_CERTIFICATION_ID),
              );
            }}
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
            onDraftInput={() => {
              onProfileDraftChange({
                generalSkills: generalSkills.slice(0, MAX_GENERAL_SKILLS),
              });
            }}
            onChange={(value) => {
              setGeneralSkills(value);
              setSkillsSaved(false);
              onProfileDraftChange({
                generalSkills: value.slice(0, MAX_GENERAL_SKILLS),
              });
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
              disabled={pending}
            >
              Save skills
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResumePreviewPaneProps {
  readonly resume: SeekerResume;
  readonly review?: boolean;
}

function ResumePreviewPane({
  resume,
  review = false,
}: ResumePreviewPaneProps) {
  const headingId = review ? "resume-review-heading" : "resume-live-preview-heading";
  const descriptionId = review
    ? "resume-review-description"
    : "resume-live-preview-description";

  return (
    <aside
      className={review ? styles.reviewPreview : styles.previewPane}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
    >
      <div className={styles.previewHeader}>
        <span className={styles.previewEyebrow}>
          <Icon name="nav.profile" size={16} aria-hidden /> Host view
        </span>
        <h2 id={headingId} className={styles.previewTitle}>
          {review ? "Resume preview" : "How hosts see you"}
        </h2>
        <p id={descriptionId} className={styles.previewDescription}>
          {review
            ? "This is the read-only resume hosts see when you apply."
            : "Updates as you edit. Changes are not saved until you use the Save button in this section."}
        </p>
      </div>
      <div className={styles.previewCard}>
        <SeekerResumeCard resume={resume} interactive={false} />
      </div>
    </aside>
  );
}

// ─── Main ResumeBuilder ────────────────────────────────────────────────────────

export interface ResumeBuilderProps {
  readonly resume: SeekerResume;
  readonly completion: number;
}

export function ResumeBuilder({ resume, completion }: ResumeBuilderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<StepId>(0);
  const [previewDraft, setPreviewDraft] = useState<ResumePreviewDraft>({});
  const dirtyDraftKindsRef = useRef(new Set<keyof ResumePreviewDraft>());
  const [draftDirty, setDraftDirty] = useState(false);
  const previewResume = buildResumePreview(resume, previewDraft);

  // Track which steps have been touched/saved
  const [completed, setCompleted] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (resume.profile?.bio || resume.profile?.displayName) s.add(0);
    if (resume.experiences.length > 0) s.add(1);
    if (resume.educations.length > 0) s.add(2);
    if (resume.certifications.length > 0 || (resume.profile?.generalSkills?.length ?? 0) > 0) s.add(3);
    return s;
  });

  function markDone(stepIndex: number) {
    setCompleted((prev) => new Set([...prev, stepIndex]));
  }

  function setDraftKindDirty(
    kind: keyof ResumePreviewDraft,
    dirty: boolean,
  ) {
    if (dirty) dirtyDraftKindsRef.current.add(kind);
    else dirtyDraftKindsRef.current.delete(kind);
    setDraftDirty(dirtyDraftKindsRef.current.size > 0);
  }

  function clearPreviewDraft() {
    setPreviewDraft({});
    dirtyDraftKindsRef.current.clear();
    setDraftDirty(false);
  }

  function selectStep(nextStep: StepId) {
    if (nextStep === step || pending) return;
    if (draftDirty && !window.confirm(
      "Discard unsaved changes? Your edits in this section will be lost.",
    )) {
      return;
    }
    clearPreviewDraft();
    setStep(nextStep);
  }

  function updateProfileDraft(draft: ProfilePreviewDraft | undefined) {
    setPreviewDraft((current) => ({
      ...current,
      profile: draft ? { ...current.profile, ...draft } : undefined,
    }));
    setDraftKindDirty("profile", draft !== undefined);
  }

  return (
    <div className={styles.builder}>
      {/* Progress + step rail */}
      <div
        role="progressbar"
        aria-valuenow={completion}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Resume completion"
      >
        <StepProgress
          current={step}
          completed={completed}
          completion={completion}
          onStep={selectStep}
          disabled={pending}
        />
      </div>

      {/* Editor → footer → preview in DOM order. Grid areas keep the preview
          beside the editor on desktop while mobile reaches nav before preview. */}
      <div
        className={`${styles.builderWorkspace}${
          step === 4 ? ` ${styles.reviewWorkspace}` : ""
        }`}
      >
        {step < 4 ? (
          <div className={styles.editorPane}>
            {step === 0 && (
              <InfoStep
                resume={resume}
                pending={pending}
                startTransition={startTransition}
                onDraftChange={updateProfileDraft}
                onSaved={() => {
                  updateProfileDraft(undefined);
                  markDone(0);
                  router.refresh();
                }}
              />
            )}
            {step === 1 && (
              <ExperienceStep
                resume={resume}
                router={router}
                pending={pending}
                startTransition={startTransition}
                onDraftChange={(experience) => {
                  setPreviewDraft((current) => ({ ...current, experience }));
                  setDraftKindDirty("experience", experience !== undefined);
                }}
                onSaved={() => { markDone(1); }}
              />
            )}
            {step === 2 && (
              <EducationStep
                resume={resume}
                router={router}
                pending={pending}
                startTransition={startTransition}
                onDraftChange={(education) => {
                  setPreviewDraft((current) => ({ ...current, education }));
                  setDraftKindDirty("education", education !== undefined);
                }}
                onSaved={() => { markDone(2); }}
              />
            )}
            {step === 3 && (
              <CertsSkillsStep
                resume={resume}
                router={router}
                pending={pending}
                startTransition={startTransition}
                onCertificationDraftChange={(certification) => {
                  setPreviewDraft((current) => ({
                    ...current,
                    certification,
                  }));
                  setDraftKindDirty(
                    "certification",
                    certification !== undefined,
                  );
                }}
                onProfileDraftChange={updateProfileDraft}
                onSaved={() => { markDone(3); }}
              />
            )}
          </div>
        ) : null}

        {/* Step footer nav — sticky on mobile once the active editor is passed. */}
        <div className={styles.stepFooter}>
          {step > 0 ? (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => { selectStep((step - 1) as StepId); }}
              disabled={pending}
            >
              <Icon name="action.back" size={16} aria-hidden /> Back
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
              onClick={() => {
                selectStep((step + 1) as StepId);
              }}
              disabled={pending}
            >
              {getResumeAdvanceLabel(step)}
              <Icon name="action.forward" size={16} aria-hidden />
            </button>
          )}
        </div>

        <ResumePreviewPane resume={previewResume} review={step === 4} />
      </div>
    </div>
  );
}
