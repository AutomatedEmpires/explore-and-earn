"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  hasResumeExperienceIdentity,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE,
} from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";
import type { ResumeDraft, SeekerResume } from "@explore-and-earn/db";

import {
  importResumeAction,
  saveImportedResumeAction,
  type ResumeImportError,
  type SaveImportedResumeResult,
} from "../../app/actions/resumeImport";
import styles from "./ResumeImport.module.css";

// Client-side caps mirror the server action (apps/web/app/actions/resumeImport).
const MAX_TEXT_CHARS = 30_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const ACCEPTED_FILE = ".pdf,.txt,application/pdf,text/plain";
const GENERIC_SAVE_ERROR_MESSAGE =
  "Couldn't save everything. Please try again or fill the steps below.";
export const PARTIAL_SAVE_MESSAGE =
  "Some résumé items were saved before the import stopped. Review the builder before importing again.";
export const OUTCOME_UNKNOWN_MESSAGE =
  "The import stopped while saving. Review the builder before importing again.";

const SEEKING_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "now", label: "Now" },
  { value: "1_month", label: "1 month" },
  { value: "3_months", label: "3 months" },
  { value: "6_months", label: "6 months" },
];

type Phase = "idle" | "input" | "loading" | "review";

// ─── Editable review models ─────────────────────────────────────────────────

interface ReviewProfile {
  include: boolean;
  displayName: string;
  location: string;
  seekingTimeline: string;
  bio: string;
  generalSkills: string[];
}

interface ReviewExperience {
  include: boolean;
  roleTitle: string;
  companyName: string;
  location: string;
  summary: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  skillTags: string[];
}

interface ReviewEducation {
  include: boolean;
  institution: string;
  programOrDegree: string;
  location: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  skillTags: string[];
}

interface ReviewCertification {
  include: boolean;
  name: string;
  issuingOrganization: string;
  description: string;
  issuedAt: string | null;
  expiresAt: string | null;
  skillTags: string[];
}

interface ReviewState {
  profile: ReviewProfile | null;
  experiences: ReviewExperience[];
  educations: ReviewEducation[];
  certifications: ReviewCertification[];
}

const ERROR_MESSAGE: Record<ResumeImportError, string> = {
  unauthenticated: "Please sign in again to import your résumé.",
  unconfigured:
    "Auto-fill connects at launch. For now, paste or type your details into the steps below — it only takes a few minutes.",
  empty_input: "Add some résumé text or choose a file first.",
  too_large: "That résumé is too large. Trim it, or paste the most relevant sections.",
  unsupported_file: "Unsupported file type. Upload a PDF or .txt, or paste the text.",
  rate_limited: "You've imported a few times just now — give it a couple of minutes.",
  parse_failed:
    "We couldn't read that résumé automatically. You can paste the text instead, or fill the steps below manually.",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function uniqCapped(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Read a File's bytes into base64 (chunked to avoid call-stack limits). */
async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Build the editable review state from a parsed draft + the current résumé. */
function toReview(draft: ResumeDraft, resume: SeekerResume): ReviewState {
  const p = draft.profileInfo;
  const existing = resume.profile;

  // Profile fields prefer parsed content, falling back to what's already saved
  // so confirming never silently wipes an existing value.
  const profile: ReviewProfile | null = p
    ? {
        include: true,
        displayName: (p.displayName ?? existing?.displayName ?? "").trim(),
        location: (p.location ?? existing?.location ?? "").trim(),
        seekingTimeline: (p.seekingTimeline ?? existing?.seekingTimeline ?? "").trim(),
        bio: (p.bio ?? existing?.bio ?? "").trim(),
        generalSkills: uniqCapped(
          [...(existing?.generalSkills ?? []), ...(p.generalSkills ?? [])],
          10,
        ),
      }
    : null;

  return {
    profile,
    experiences: (draft.experiences ?? []).map((e) => ({
      include: true,
      roleTitle: (e.roleTitle ?? "").trim(),
      companyName: (e.companyName ?? "").trim(),
      location: e.location ?? "",
      summary: e.summary ?? "",
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      isCurrent: e.isCurrent ?? false,
      skillTags: [...(e.skillTags ?? [])],
    })),
    educations: (draft.educations ?? []).map((e) => ({
      include: true,
      institution: e.institution ?? "",
      programOrDegree: e.programOrDegree ?? "",
      location: e.location ?? "",
      description: e.description ?? "",
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      isCurrent: e.isCurrent ?? false,
      skillTags: [...(e.skillTags ?? [])],
    })),
    certifications: (draft.certifications ?? []).map((c) => ({
      include: true,
      name: c.name,
      issuingOrganization: c.issuingOrganization ?? "",
      description: c.description ?? "",
      issuedAt: c.issuedAt ?? null,
      expiresAt: c.expiresAt ?? null,
      skillTags: [...(c.skillTags ?? [])],
    })),
  };
}

/** Assemble the confirmed draft to persist from the reviewed/edited state. */
function toDraftForSave(review: ReviewState): ResumeDraft {
  const profileInfo =
    review.profile && review.profile.include
      ? {
          displayName: review.profile.displayName.trim() || null,
          location: review.profile.location.trim() || null,
          seekingTimeline: review.profile.seekingTimeline.trim() || null,
          generalSkills: review.profile.generalSkills,
          bio: review.profile.bio.trim() || null,
        }
      : undefined;

  return {
    profileInfo,
    experiences: review.experiences
      .filter((e) => e.include)
      .map((e) => ({
        roleTitle: e.roleTitle.trim() || undefined,
        companyName: e.companyName.trim() || undefined,
        location: e.location.trim() || null,
        summary: e.summary.trim() || undefined,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        skillTags: e.skillTags,
      })),
    educations: review.educations
      .filter((e) => e.include)
      .map((e) => ({
        institution: e.institution.trim() || undefined,
        programOrDegree: e.programOrDegree.trim() || undefined,
        location: e.location.trim() || null,
        description: e.description.trim() || undefined,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        skillTags: e.skillTags,
      })),
    certifications: review.certifications
      .filter((e) => e.include && e.name.trim())
      .map((e) => ({
        name: e.name.trim(),
        issuingOrganization: e.issuingOrganization.trim() || undefined,
        description: e.description.trim() || null,
        issuedAt: e.issuedAt,
        expiresAt: e.expiresAt,
        skillTags: e.skillTags,
      })),
  };
}

function reviewHasContent(review: ReviewState): boolean {
  return (
    (review.profile?.include ?? false) ||
    review.experiences.some((e) => e.include) ||
    review.educations.some((e) => e.include) ||
    review.certifications.some((e) => e.include)
  );
}

function hasInvalidIncludedExperience(review: ReviewState): boolean {
  return review.experiences.some(
    (experience) =>
      experience.include && !hasResumeExperienceIdentity(experience),
  );
}

function experienceIncludeLabel(
  experience: ReviewExperience,
  index: number,
): string {
  const role = experience.roleTitle.trim();
  const company = experience.companyName.trim();
  const identity = role && company ? `${role} at ${company}` : role || company;
  return identity
    ? `Include experience ${index + 1}: ${identity}`
    : `Include experience ${index + 1}`;
}

function profileIncludeLabel(profile: ReviewProfile): string {
  const identity = profile.displayName.trim() || profile.location.trim();
  return identity
    ? `Include profile details: ${identity}`
    : "Include profile details";
}

function educationIncludeLabel(
  education: ReviewEducation,
  index: number,
): string {
  const program = education.programOrDegree.trim();
  const institution = education.institution.trim();
  const identity =
    program && institution ? `${program} at ${institution}` : program || institution;
  return identity
    ? `Include education ${index + 1}: ${identity}`
    : `Include education ${index + 1}`;
}

function certificationIncludeLabel(
  certification: ReviewCertification,
  index: number,
): string {
  const name = certification.name.trim();
  const issuer = certification.issuingOrganization.trim();
  const identity = name && issuer ? `${name} from ${issuer}` : name || issuer;
  return identity
    ? `Include certification ${index + 1}: ${identity}`
    : `Include certification ${index + 1}`;
}

interface ResumeImportSaveHandlers {
  readonly refresh: () => void;
  readonly reset: () => void;
  readonly closeReviewWithMessage: (message: string) => void;
  readonly showError: (message: string) => void;
}

export function applyResumeImportSaveResult(
  result: SaveImportedResumeResult,
  handlers: ResumeImportSaveHandlers,
): void {
  if (result.ok) {
    handlers.refresh();
    handlers.reset();
    return;
  }
  if (result.error === "partial_save") {
    handlers.refresh();
    handlers.closeReviewWithMessage(PARTIAL_SAVE_MESSAGE);
    return;
  }
  if (result.error === "outcome_unknown") {
    handlers.refresh();
    handlers.closeReviewWithMessage(OUTCOME_UNKNOWN_MESSAGE);
    return;
  }
  handlers.showError(
    result.error === RESUME_EXPERIENCE_IDENTITY_REQUIRED
      ? RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE
      : GENERIC_SAVE_ERROR_MESSAGE,
  );
}

export function ResumeImportNotice({ message }: { readonly message: string }) {
  return (
    <p className={styles.noticeError} role="alert">
      <span className={styles.noticeIcon}>
        <Icon name="system.warning" size={16} aria-hidden />
      </span>
      {message}
    </p>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface ResumeImportProps {
  readonly resume: SeekerResume;
}

export function ResumeImport({ resume }: ResumeImportProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase("idle");
    setText("");
    setFile(null);
    setError(null);
    setReview(null);
  }

  function closeReviewWithMessage(message: string) {
    setPhase("idle");
    setText("");
    setFile(null);
    setReview(null);
    setError(message);
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setError(ERROR_MESSAGE.too_large);
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function handleParse() {
    setError(null);
    const trimmed = text.trim();
    if (!trimmed && !file) {
      setError(ERROR_MESSAGE.empty_input);
      return;
    }
    if (trimmed.length > MAX_TEXT_CHARS) {
      setError(ERROR_MESSAGE.too_large);
      return;
    }

    setPhase("loading");
    try {
      // A .txt file is read client-side and sent as text (zero-dep path); PDFs
      // go up as base64 for the model to read.
      let payload: Parameters<typeof importResumeAction>[0];
      if (file && file.type !== "text/plain" && !file.name.endsWith(".txt")) {
        const dataBase64 = await fileToBase64(file);
        payload = {
          text: trimmed || undefined,
          file: { name: file.name, mediaType: file.type || "application/pdf", dataBase64 },
        };
      } else if (file) {
        const fileText = await file.text();
        payload = { text: `${trimmed}\n\n${fileText}`.trim().slice(0, MAX_TEXT_CHARS) };
      } else {
        payload = { text: trimmed };
      }

      const result = await importResumeAction(payload);
      if (!result.ok) {
        setError(ERROR_MESSAGE[result.error]);
        setPhase("input");
        return;
      }
      setReview(toReview(result.draft, resume));
      setPhase("review");
    } catch {
      setError(ERROR_MESSAGE.parse_failed);
      setPhase("input");
    }
  }

  function handleSave() {
    if (!review) return;
    if (hasInvalidIncludedExperience(review)) return;
    setError(null);
    const draft = toDraftForSave(review);
    startTransition(async () => {
      try {
        const result = await saveImportedResumeAction(draft);
        applyResumeImportSaveResult(result, {
          refresh: () => router.refresh(),
          reset,
          closeReviewWithMessage,
          showError: setError,
        });
      } catch {
        applyResumeImportSaveResult(
          { ok: false, error: "outcome_unknown" },
          {
            refresh: () => router.refresh(),
            reset,
            closeReviewWithMessage,
            showError: setError,
          },
        );
      }
    });
  }

  function handleReviewChange(next: ReviewState) {
    setReview(next);
    setError(null);
  }

  // ── Collapsed trigger ──────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className={styles.wrap}>
        {error ? <ResumeImportNotice message={error} /> : null}
        <button
          type="button"
          className={styles.trigger}
          onClick={() => {
            setError(null);
            setPhase("input");
          }}
        >
          <span className={styles.triggerIcon}>
            <Icon name="profile.resume" size={22} aria-hidden />
          </span>
          <span className={styles.triggerText}>
            <span className={styles.triggerTitle}>Import your résumé</span>
            <span className={styles.triggerSub}>
              Paste it or upload a PDF — we&apos;ll fill in the steps for you to review.
            </span>
          </span>
          <span className={styles.triggerChevron}>
            <Icon name="action.forward" size={20} aria-hidden />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.headTitle}>Import your résumé</h2>
            <p className={styles.headSub}>
              Nothing is saved until you review and confirm.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={reset}
            aria-label="Close import"
            disabled={pending}
          >
            <Icon name="action.close" size={18} aria-hidden />
          </button>
        </div>

        {error ? <ResumeImportNotice message={error} /> : null}

        {/* ── Input ── */}
        {phase === "input" && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Paste your résumé text</span>
              <textarea
                className={styles.textarea}
                value={text}
                maxLength={MAX_TEXT_CHARS}
                placeholder="Paste the contents of your résumé here…"
                onChange={(e) => { setText(e.target.value); setError(null); }}
              />
            </label>

            <div className={styles.divider}>or</div>

            <div className={styles.fileRow}>
              <button
                type="button"
                className={styles.fileBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="action.upload" size={16} aria-hidden />
                Choose file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE}
                className={styles.hiddenFile}
                onChange={handlePickFile}
              />
              {file && <span className={styles.fileName}>{file.name}</span>}
            </div>
            <p className={styles.notice}>
              <span className={styles.noticeIcon}>
                <Icon name="system.info" size={16} aria-hidden />
              </span>
              PDF or plain-text (.txt), up to 2MB. We map your content into the
              E&amp;E résumé and never store the original file.
            </p>

            <div className={styles.actions}>
              <button type="button" className={styles.ghostBtn} onClick={reset}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => { void handleParse(); }}
                disabled={!text.trim() && !file}
              >
                <Icon name="action.apply" size={16} aria-hidden />
                Read my résumé
              </button>
            </div>
          </>
        )}

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div className={styles.loading}>
            <span className={styles.spinner}>
              <Icon name="system.loading" size={28} aria-hidden />
            </span>
            <p className={styles.loadingText}>Reading your résumé…</p>
          </div>
        )}

        {/* ── Review ── */}
        {phase === "review" && review && (
          <ReviewPanel
            review={review}
            onChange={handleReviewChange}
            onSave={handleSave}
            onCancel={reset}
            pending={pending}
          />
        )}
      </div>
    </div>
  );
}

// ─── Review panel ───────────────────────────────────────────────────────────

interface ReviewPanelProps {
  review: ReviewState;
  onChange: (next: ReviewState) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}

export function ReviewPanel({ review, onChange, onSave, onCancel, pending }: ReviewPanelProps) {
  const empty =
    !review.profile &&
    review.experiences.length === 0 &&
    review.educations.length === 0 &&
    review.certifications.length === 0;

  function patchProfile(patch: Partial<ReviewProfile>) {
    if (!review.profile) return;
    onChange({ ...review, profile: { ...review.profile, ...patch } });
  }
  function patchExp(i: number, patch: Partial<ReviewExperience>) {
    const next = review.experiences.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...review, experiences: next });
  }
  function patchEdu(i: number, patch: Partial<ReviewEducation>) {
    const next = review.educations.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...review, educations: next });
  }
  function patchCert(i: number, patch: Partial<ReviewCertification>) {
    const next = review.certifications.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...review, certifications: next });
  }

  if (empty) {
    return (
      <>
        <p className={styles.notice}>
          <span className={styles.noticeIcon}>
            <Icon name="system.info" size={16} aria-hidden />
          </span>
          We couldn&apos;t pull structured details from that résumé. No problem —
          fill the steps below manually and hosts will see the same profile.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={onCancel}>
            Got it
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className={styles.reviewIntro}>
        Here&apos;s what we found. Uncheck anything you don&apos;t want, edit the
        details, then save to your résumé.
      </p>

      {/* Profile */}
      {review.profile && (
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>Profile</h3>
          </div>
          <div className={review.profile.include ? styles.item : styles.itemExcluded}>
            <label className={styles.includeToggle}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={review.profile.include}
                onChange={(e) => { patchProfile({ include: e.target.checked }); }}
                aria-label={profileIncludeLabel(review.profile)}
              />
            </label>
            <div className={styles.itemFields}>
              <div className={styles.grid2}>
                <label className={styles.field}>
                  <span className={styles.label}>Full name</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={review.profile.displayName}
                    onChange={(e) => { patchProfile({ displayName: e.target.value }); }}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Location</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={review.profile.location}
                    onChange={(e) => { patchProfile({ location: e.target.value }); }}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Seeking timeline</span>
                <select
                  className={styles.input}
                  value={review.profile.seekingTimeline}
                  onChange={(e) => { patchProfile({ seekingTimeline: e.target.value }); }}
                >
                  {SEEKING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Bio</span>
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 88 }}
                  value={review.profile.bio}
                  onChange={(e) => { patchProfile({ bio: e.target.value }); }}
                />
              </label>
              {review.profile.generalSkills.length > 0 && (
                <div className={styles.field}>
                  <span className={styles.label}>Skills</span>
                  <div className={styles.chips}>
                    {review.profile.generalSkills.map((s) => (
                      <span key={s} className={styles.chip}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Experience */}
      {review.experiences.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>Experience</h3>
          </div>
          {review.experiences.map((exp, i) => {
            const identityInvalid =
              exp.include && !hasResumeExperienceIdentity(exp);
            const identityErrorId = `resume-import-experience-${i}-identity-error`;
            return (
              <div
                key={i}
                className={
                  exp.include
                    ? identityInvalid
                      ? `${styles.item} ${styles.itemInvalid}`
                      : styles.item
                    : styles.itemExcluded
                }
              >
                <label className={styles.includeToggle}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={exp.include}
                    onChange={(e) => {
                      patchExp(i, { include: e.target.checked });
                    }}
                    aria-label={experienceIncludeLabel(exp, i)}
                  />
                </label>
                <div className={styles.itemFields}>
                  <div className={styles.grid2}>
                    <label className={styles.field}>
                      <span className={styles.label}>Role title</span>
                      <input
                        className={styles.input}
                        type="text"
                        value={exp.roleTitle}
                        aria-invalid={identityInvalid}
                        aria-describedby={
                          identityInvalid ? identityErrorId : undefined
                        }
                        onChange={(e) => {
                          patchExp(i, { roleTitle: e.target.value });
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Employer / place</span>
                      <input
                        className={styles.input}
                        type="text"
                        value={exp.companyName}
                        aria-invalid={identityInvalid}
                        aria-describedby={
                          identityInvalid ? identityErrorId : undefined
                        }
                        onChange={(e) => {
                          patchExp(i, { companyName: e.target.value });
                        }}
                      />
                    </label>
                  </div>
                  {identityInvalid ? (
                    <p id={identityErrorId} className={styles.identityError}>
                      {RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE}
                    </p>
                  ) : null}
                  <label className={styles.field}>
                    <span className={styles.label}>Location</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={exp.location}
                      onChange={(e) => {
                        patchExp(i, { location: e.target.value });
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Summary</span>
                    <textarea
                      className={styles.textarea}
                      style={{ minHeight: 72 }}
                      value={exp.summary}
                      onChange={(e) => {
                        patchExp(i, { summary: e.target.value });
                      }}
                    />
                  </label>
                  {exp.skillTags.length > 0 && (
                    <div className={styles.chips}>
                      {exp.skillTags.map((s) => (
                        <span key={s} className={styles.chip}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Education */}
      {review.educations.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>Education</h3>
          </div>
          {review.educations.map((edu, i) => (
            <div key={i} className={edu.include ? styles.item : styles.itemExcluded}>
              <label className={styles.includeToggle}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={edu.include}
                  onChange={(e) => { patchEdu(i, { include: e.target.checked }); }}
                  aria-label={educationIncludeLabel(edu, i)}
                />
              </label>
              <div className={styles.itemFields}>
                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span className={styles.label}>Degree / program</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={edu.programOrDegree}
                      onChange={(e) => { patchEdu(i, { programOrDegree: e.target.value }); }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>School / institution</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={edu.institution}
                      onChange={(e) => { patchEdu(i, { institution: e.target.value }); }}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>Notes</span>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: 64 }}
                    value={edu.description}
                    onChange={(e) => { patchEdu(i, { description: e.target.value }); }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certifications */}
      {review.certifications.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>Certifications</h3>
          </div>
          {review.certifications.map((cert, i) => (
            <div key={i} className={cert.include ? styles.item : styles.itemExcluded}>
              <label className={styles.includeToggle}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={cert.include}
                  onChange={(e) => { patchCert(i, { include: e.target.checked }); }}
                  aria-label={certificationIncludeLabel(cert, i)}
                />
              </label>
              <div className={styles.itemFields}>
                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span className={styles.label}>Certification name</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={cert.name}
                      onChange={(e) => { patchCert(i, { name: e.target.value }); }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Issuing organization</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={cert.issuingOrganization}
                      onChange={(e) => { patchCert(i, { issuingOrganization: e.target.value }); }}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>Description</span>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: 56 }}
                    value={cert.description}
                    onChange={(e) => { patchCert(i, { description: e.target.value }); }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <span className={styles.status}>{pending ? "Saving…" : ""}</span>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={onCancel}
          disabled={pending}
        >
          Discard
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onSave}
          disabled={
            pending ||
            !reviewHasContent(review) ||
            hasInvalidIncludedExperience(review)
          }
        >
          <Icon name="action.apply" size={16} aria-hidden />
          Save to my résumé
        </button>
      </div>
    </>
  );
}
