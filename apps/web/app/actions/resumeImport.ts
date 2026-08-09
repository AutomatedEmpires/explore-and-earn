"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import { z } from "zod";
import {
  addResumeExperience,
  addResumeEducation,
  addSeekerCertification,
  updateSeekerProfileInfo,
  updateSeekerProfileBio,
  type ResumeDraft,
  type ResumeDraftProfileInfo,
  type ResumeDraftExperience,
  type ResumeDraftEducation,
  type ResumeDraftCertification,
  type ResumeExperienceInput,
} from "@explore-and-earn/db";
import {
  hasResumeExperienceIdentity,
  MARKETPLACE_CATEGORIES,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED,
  SEEKER_SEEKING_TIMELINES,
} from "@explore-and-earn/contracts";

import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

/**
 * Intelligent résumé import — parse ONLY, never persists.
 *
 * A seeker pastes text or uploads a résumé; we map its real content into the
 * E&E résumé-draft shape (@explore-and-earn/db → ResumeDraft) so the review UI
 * can render editable fields. NOTHING is written until the seeker reviews and
 * confirms via `saveImportedResumeAction`.
 *
 * Guardrails mirror the AI assistant route (apps/web/app/api/assistant/route.ts):
 *   - Clerk-auth gated; identity comes from auth().userId, never the client.
 *   - Per-user rate limit (abuse + gateway-cost control).
 *   - Hard size caps on pasted text and uploaded files.
 *   - Degrades gracefully to { ok:false, error:"unconfigured" } when the AI
 *     gateway key is absent (local dev / pre-launch) — the UI then tells the
 *     seeker to fill the résumé manually. Never throws; parse failures return
 *     { ok:false, error:"parse_failed" }.
 *   - The model is instructed to extract ONLY what the document contains and to
 *     leave unknown fields empty — no fabricated experience/skills.
 */

const MODEL = process.env.ASSISTANT_MODEL ?? "anthropic/claude-sonnet-4.5";

// Caps. Pasted text is bounded to keep a single prompt cheap; uploaded files
// (PDF) are bounded on the base64 payload (~2MB decoded ≈ 2.8M base64 chars).
const MAX_TEXT_CHARS = 30_000;
const MAX_FILE_BASE64_CHARS = 2_800_000;
const ALLOWED_FILE_MEDIA_TYPES = new Set(["application/pdf", "text/plain"]);

// Output caps — keep an imported draft focused and aligned with the builder's
// own limits (experiences max 3, general skills max 10).
const MAX_DRAFT_EXPERIENCES = 3;
const MAX_DRAFT_EDUCATIONS = 5;
const MAX_DRAFT_CERTIFICATIONS = 10;
const MAX_GENERAL_SKILLS = 10;
const MAX_SKILL_TAGS = 3;

const VALID_TIMELINES = new Set<string>(SEEKER_SEEKING_TIMELINES);
const VALID_CATEGORIES = new Set<string>(MARKETPLACE_CATEGORIES as readonly string[]);

export interface ResumeImportFile {
  readonly name: string;
  readonly mediaType: string;
  /** base64-encoded file bytes (no data: prefix). */
  readonly dataBase64: string;
}

export interface ResumeImportInput {
  /** Pasted résumé text — always supported. */
  readonly text?: string;
  /** Optional uploaded file (PDF or .txt). */
  readonly file?: ResumeImportFile;
}

export type ResumeImportError =
  | "unauthenticated"
  | "unconfigured"
  | "empty_input"
  | "too_large"
  | "unsupported_file"
  | "rate_limited"
  | "parse_failed";

export type ResumeImportResult =
  | { readonly ok: true; readonly draft: ResumeDraft }
  | { readonly ok: false; readonly error: ResumeImportError };

// ─── Extraction schema (mirrors ResumeDraft; parser fills only real content) ──

const experienceSchema = z.object({
  companyName: z.string().optional(),
  roleTitle: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
  summary: z.string().optional(),
  skillTags: z.array(z.string()).optional(),
});

const educationSchema = z.object({
  institution: z.string().optional(),
  programOrDegree: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().optional(),
  skillTags: z.array(z.string()).optional(),
});

const certificationSchema = z.object({
  name: z.string().optional(),
  issuingOrganization: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  description: z.string().optional(),
  skillTags: z.array(z.string()).optional(),
});

const draftSchema = z.object({
  profileInfo: z
    .object({
      displayName: z.string().optional(),
      location: z.string().optional(),
      seekingTimeline: z.string().optional(),
      generalSkills: z.array(z.string()).optional(),
      bio: z.string().optional(),
    })
    .optional(),
  experiences: z.array(experienceSchema).optional(),
  educations: z.array(educationSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
});

type RawDraft = z.infer<typeof draftSchema>;

const SYSTEM_PROMPT = [
  "You extract structured résumé data from a person's own résumé.",
  "Return ONLY information that is explicitly present in the provided text or file.",
  "Never invent, infer, embellish, or guess. If a field is not clearly stated, leave it empty (omit it).",
  "Do not add skills, employers, dates, or achievements that are not written in the source.",
  "For dates, prefer YYYY-MM (month) or YYYY when only a year is given; leave empty if unclear.",
  `seekingTimeline must be one of: ${SEEKER_SEEKING_TIMELINES.join(", ")} — only if the source clearly implies availability; otherwise omit.`,
  "bio: a short first-person summary ONLY if the résumé contains a summary/objective/about section; otherwise omit.",
  "skillTags per entry: at most a few short skills actually mentioned for that role.",
  "Keep summaries concise (1-3 sentences) using the résumé's own wording.",
].join(" ");

// ─── Sanitizers ───────────────────────────────────────────────────────────────

function clean(value: string | undefined | null, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanTags(tags: string[] | undefined, max: number): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = clean(raw, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export interface ImportedResumeSavedCounts {
  readonly profile: boolean;
  readonly experiences: number;
  readonly educations: number;
  readonly certifications: number;
}

export type SaveImportedResumeResult =
  | { readonly ok: true; readonly saved: ImportedResumeSavedCounts }
  | {
      readonly ok: false;
      readonly error: "partial_save";
      readonly saved: ImportedResumeSavedCounts;
    }
  | {
      readonly ok: false;
      readonly error:
        | "unauthenticated"
        | typeof RESUME_EXPERIENCE_IDENTITY_REQUIRED
        | "outcome_unknown"
        | "unexpected_error";
    };

function hasSavedAnything(saved: ImportedResumeSavedCounts): boolean {
  return (
    saved.profile ||
    saved.experiences > 0 ||
    saved.educations > 0 ||
    saved.certifications > 0
  );
}

function revalidateResumePaths(): void {
  for (const path of ["/resume", "/profile"] as const) {
    try {
      revalidatePath(path);
    } catch (error) {
      reportError(error, {
        action: `saveImportedResumeAction.revalidate:${path}`,
      });
    }
  }
}

function reportPersistenceFailure(
  action: string,
  error: unknown,
  saved: ImportedResumeSavedCounts,
): SaveImportedResumeResult {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  reportError(
    error instanceof Error
      ? error
      : new Error(`${action} persistence failed${detail ? `: ${detail}` : ""}`),
    { action },
  );
  if (!hasSavedAnything(saved)) {
    return { ok: false, error: "unexpected_error" };
  }
  revalidateResumePaths();
  return { ok: false, error: "partial_save", saved };
}

function reportUnknownPersistenceOutcome(
  action: string,
  error: unknown,
): SaveImportedResumeResult {
  reportError(error, { action });
  revalidateResumePaths();
  return { ok: false, error: "outcome_unknown" };
}

/** Map the model's raw object into the shared ResumeDraft shape, sanitized. */
function toDraft(raw: RawDraft): ResumeDraft {
  const profileInfoRaw = raw.profileInfo;
  let profileInfo: ResumeDraftProfileInfo | undefined;
  if (profileInfoRaw) {
    const timeline = clean(profileInfoRaw.seekingTimeline, 20);
    const info: ResumeDraftProfileInfo = {
      displayName: clean(profileInfoRaw.displayName, 120) ?? null,
      location: clean(profileInfoRaw.location, 120) ?? null,
      seekingTimeline:
        timeline && VALID_TIMELINES.has(timeline) ? timeline : null,
      generalSkills: cleanTags(profileInfoRaw.generalSkills, MAX_GENERAL_SKILLS),
      bio: clean(profileInfoRaw.bio, 1200) ?? null,
    };
    profileInfo = info;
  }

  const experiences: ResumeDraftExperience[] = (raw.experiences ?? [])
    .slice(0, MAX_DRAFT_EXPERIENCES)
    .map((exp) => ({
      companyName: clean(exp.companyName, 120),
      roleTitle: clean(exp.roleTitle, 120),
      location: clean(exp.location, 120) ?? null,
      startDate: clean(exp.startDate, 10) ?? null,
      endDate: exp.isCurrent ? null : clean(exp.endDate, 10) ?? null,
      isCurrent: exp.isCurrent === true,
      summary: clean(exp.summary, 800),
      skillTags: cleanTags(exp.skillTags, MAX_SKILL_TAGS),
    }));

  const educations: ResumeDraftEducation[] = (raw.educations ?? [])
    .slice(0, MAX_DRAFT_EDUCATIONS)
    .map((edu) => ({
      institution: clean(edu.institution, 160),
      programOrDegree: clean(edu.programOrDegree, 160),
      location: clean(edu.location, 120) ?? null,
      startDate: clean(edu.startDate, 10) ?? null,
      endDate: edu.isCurrent ? null : clean(edu.endDate, 10) ?? null,
      isCurrent: edu.isCurrent === true,
      description: clean(edu.description, 600),
      skillTags: cleanTags(edu.skillTags, MAX_SKILL_TAGS),
    }));

  const certifications: ResumeDraftCertification[] = (raw.certifications ?? [])
    .map((cert) => {
      const name = clean(cert.name, 160);
      if (!name) return null;
      const c: ResumeDraftCertification = {
        name,
        issuingOrganization: clean(cert.issuingOrganization, 160),
        issuedAt: clean(cert.issuedAt, 10) ?? null,
        expiresAt: clean(cert.expiresAt, 10) ?? null,
        description: clean(cert.description, 600) ?? null,
        skillTags: cleanTags(cert.skillTags, MAX_SKILL_TAGS),
      };
      return c;
    })
    .filter((c): c is ResumeDraftCertification => c !== null)
    .slice(0, MAX_DRAFT_CERTIFICATIONS);

  return { profileInfo, experiences, educations, certifications };
}

// ─── Parse action ─────────────────────────────────────────────────────────────

export async function importResumeAction(
  input: ResumeImportInput,
): Promise<ResumeImportResult> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return { ok: false, error: "unauthenticated" };
    // Token proves the caller has a live session; parsing never touches the DB
    // but we mint it to stay consistent with every other authed action.
    const token = await getToken();
    if (!token) return { ok: false, error: "unauthenticated" };

    // Degrade honestly when the gateway is unconfigured (local dev / pre-launch).
    if (!process.env.AI_GATEWAY_API_KEY) {
      return { ok: false, error: "unconfigured" };
    }

    const text = typeof input.text === "string" ? input.text.trim() : "";
    const file = input.file;

    if (!text && !file) return { ok: false, error: "empty_input" };

    if (text.length > MAX_TEXT_CHARS) return { ok: false, error: "too_large" };

    if (file) {
      if (!ALLOWED_FILE_MEDIA_TYPES.has(file.mediaType)) {
        return { ok: false, error: "unsupported_file" };
      }
      if (
        typeof file.dataBase64 !== "string" ||
        file.dataBase64.length === 0 ||
        file.dataBase64.length > MAX_FILE_BASE64_CHARS
      ) {
        return { ok: false, error: "too_large" };
      }
    }

    const limited = await checkRateLimitDistributed(`resume-import:${userId}`, 5, 15 * 60 * 1000);
    if (!limited.allowed) return { ok: false, error: "rate_limited" };

    // Build one user message: instructions + the pasted text and/or the file.
    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; data: string; mediaType: string }
    > = [];
    parts.push({
      type: "text",
      text: text
        ? `Extract the résumé data from the following content.\n\n${text}`
        : "Extract the résumé data from the attached file.",
    });
    if (file) {
      parts.push({ type: "file", data: file.dataBase64, mediaType: file.mediaType });
    }

    const { object } = await generateObject({
      model: MODEL,
      schema: draftSchema,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts }],
      maxOutputTokens: 2000,
      temperature: 0,
    });

    return { ok: true, draft: toDraft(object) };
  } catch (error) {
    reportError(error, { action: "importResumeAction" });
    return { ok: false, error: "parse_failed" };
  }
}

// ─── Save reviewed draft ────────────────────────────────────────────────────

/**
 * Persist a reviewed & edited draft via the SAME scoped CRUD the manual builder
 * uses. Only called after the seeker confirms in the review UI. `profileInfo`,
 * when present, OVERWRITES the profile fields — the review UI pre-fills those
 * with the seeker's current values merged with parsed content, so confirming is
 * an explicit choice. Every write is scoped to auth().userId inside the db layer.
 */
export async function saveImportedResumeAction(
  draft: ResumeDraft,
): Promise<SaveImportedResumeResult> {
  let profileSaved = false;
  let experiencesSaved = 0;
  let educationsSaved = 0;
  let certificationsSaved = 0;
  let persistenceAttempted = false;
  const savedCounts = (): ImportedResumeSavedCounts => ({
    profile: profileSaved,
    experiences: experiencesSaved,
    educations: educationsSaved,
    certifications: certificationsSaved,
  });

  try {
    const { userId, getToken } = await auth();
    if (!userId) return { ok: false, error: "unauthenticated" };
    const token = await getToken();
    if (!token) return { ok: false, error: "unauthenticated" };

    // Validate every included experience before the first profile or row write.
    // The review UI omits excluded rows from the draft, but the server repeats the
    // invariant because callers can invoke this action without that UI.
    const sanitizedExperiences: ResumeExperienceInput[] = (
      draft.experiences ?? []
    ).map((exp) => ({
      companyName: clean(exp.companyName, 120) ?? null,
      roleTitle: clean(exp.roleTitle, 120) ?? null,
      location: clean(exp.location ?? undefined, 120) ?? null,
      startDate: clean(exp.startDate ?? undefined, 10) ?? null,
      endDate: exp.isCurrent
        ? null
        : clean(exp.endDate ?? undefined, 10) ?? null,
      isCurrent: exp.isCurrent === true,
      summary: clean(exp.summary, 800),
      categoryTags: (exp.categoryTags ?? []).filter((category) =>
        VALID_CATEGORIES.has(category),
      ),
      skillTags: cleanTags(exp.skillTags, MAX_SKILL_TAGS),
    }));
    if (
      sanitizedExperiences.some(
        (experience) => !hasResumeExperienceIdentity(experience),
      )
    ) {
      return { ok: false, error: RESUME_EXPERIENCE_IDENTITY_REQUIRED };
    }

    if (draft.profileInfo) {
      const info = draft.profileInfo;
      const timeline = clean(info.seekingTimeline ?? undefined, 20);
      const profileInput = {
        displayName: clean(info.displayName ?? undefined, 120) ?? null,
        location: clean(info.location ?? undefined, 120) ?? null,
        seekingTimeline:
          timeline && VALID_TIMELINES.has(timeline) ? timeline : null,
        generalSkills: cleanTags(info.generalSkills, MAX_GENERAL_SKILLS),
      };
      persistenceAttempted = true;
      const infoResult = await updateSeekerProfileInfo(token, userId, profileInput);
      if (!infoResult.ok) {
        return reportPersistenceFailure(
          "saveImportedResumeAction.profileInfo",
          infoResult.error,
          savedCounts(),
        );
      }
      profileSaved = true;

      if (info.bio !== undefined) {
        const bioInput = {
          bio: clean(info.bio ?? undefined, 1200) ?? null,
        };
        persistenceAttempted = true;
        const bioResult = await updateSeekerProfileBio(token, userId, bioInput);
        if (!bioResult.ok) {
          return reportPersistenceFailure(
            "saveImportedResumeAction.bio",
            bioResult.error,
            savedCounts(),
          );
        }
      }
    }

    for (const exp of sanitizedExperiences.slice(0, MAX_DRAFT_EXPERIENCES)) {
      persistenceAttempted = true;
      const result = await addResumeExperience(token, userId, exp);
      if (!result.ok) {
        return reportPersistenceFailure(
          "saveImportedResumeAction.experience",
          result.error,
          savedCounts(),
        );
      }
      experiencesSaved += 1;
    }

    for (const edu of (draft.educations ?? []).slice(0, MAX_DRAFT_EDUCATIONS)) {
      const educationInput = {
        institution: clean(edu.institution, 160),
        programOrDegree: clean(edu.programOrDegree, 160),
        location: clean(edu.location ?? undefined, 120) ?? null,
        startDate: clean(edu.startDate ?? undefined, 10) ?? null,
        endDate: edu.isCurrent ? null : clean(edu.endDate ?? undefined, 10) ?? null,
        isCurrent: edu.isCurrent === true,
        description: clean(edu.description, 600),
        skillTags: cleanTags(edu.skillTags, MAX_SKILL_TAGS),
      };
      persistenceAttempted = true;
      const result = await addResumeEducation(token, userId, educationInput);
      if (!result.ok) {
        return reportPersistenceFailure(
          "saveImportedResumeAction.education",
          result.error,
          savedCounts(),
        );
      }
      educationsSaved += 1;
    }

    for (const cert of (draft.certifications ?? []).slice(0, MAX_DRAFT_CERTIFICATIONS)) {
      const name = clean(cert.name, 160);
      if (!name) continue;
      const certificationInput = {
        name,
        issuingOrganization: clean(cert.issuingOrganization, 160),
        issuedAt: clean(cert.issuedAt ?? undefined, 10) ?? null,
        expiresAt: clean(cert.expiresAt ?? undefined, 10) ?? null,
        description: clean(cert.description ?? undefined, 600) ?? null,
        categoryTags: (cert.categoryTags ?? []).filter((c) => VALID_CATEGORIES.has(c)),
        skillTags: cleanTags(cert.skillTags, MAX_SKILL_TAGS),
      };
      persistenceAttempted = true;
      const result = await addSeekerCertification(token, userId, certificationInput);
      if (!result.ok) {
        return reportPersistenceFailure(
          "saveImportedResumeAction.certification",
          result.error,
          savedCounts(),
        );
      }
      certificationsSaved += 1;
    }

    revalidateResumePaths();

    return {
      ok: true,
      saved: savedCounts(),
    };
  } catch (error) {
    if (persistenceAttempted) {
      return reportUnknownPersistenceOutcome(
        "saveImportedResumeAction.outcomeUnknown",
        error,
      );
    }
    return reportPersistenceFailure(
      "saveImportedResumeAction",
      error,
      savedCounts(),
    );
  }
}
