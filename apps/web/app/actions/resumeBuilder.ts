"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  hasResumeExperienceIdentity,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED,
  SEEKER_SEEKING_TIMELINES,
} from "@explore-and-earn/contracts";
import {
  addResumeExperience,
  updateResumeExperience,
  deleteResumeExperience,
  addResumeEducation,
  updateResumeEducation,
  deleteResumeEducation,
  addSeekerCertification,
  updateSeekerCertification,
  deleteSeekerCertification,
  updateSeekerProfileBio,
  updateSeekerProfileInfo,
  type ResumeExperienceInput,
  type ResumeEducationInput,
  type ResumeCertificationInput,
  type SeekerProfileInfoInput,
} from "@explore-and-earn/db";
import { queueSeekerMatchRecompute } from "../../lib/matchRecompute";
import { reportError } from "../../lib/sentry";

export interface ResumeActionResult {
  readonly ok: boolean;
  readonly id?: string;
  readonly error?: string;
}

async function getAuth(): Promise<{ userId: string; token: string } | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();
  if (!token) return null;
  return { userId, token };
}

const VALID_TIMELINES = new Set<string>(SEEKER_SEEKING_TIMELINES);

function revalidate() {
  for (const route of ["/resume", "/profile"] as const) {
    try {
      revalidatePath(route);
    } catch (error) {
      // Persistence is already durable at this point. Cache invalidation is
      // best-effort so a transient refresh fault cannot invite a duplicate
      // retry while still being visible to server-side observability.
      reportError(error, {
        action: "resumeBuilder.revalidate",
        route,
      });
    }
  }
}

function sanitizedExperienceInput(
  input: ResumeExperienceInput,
): ResumeExperienceInput {
  return {
    ...input,
    roleTitle: input.roleTitle?.trim() || null,
    companyName: input.companyName?.trim() || null,
  };
}

function reportPersistenceFailure(
  action: string,
  error: string | undefined,
): ResumeActionResult {
  reportError(new Error(`${action} persistence failed${error ? `: ${error}` : ""}`), {
    action,
  });
  return { ok: false, error: "unexpected_error" };
}

export async function saveBioAction(bio: string): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await updateSeekerProfileBio(session.token, session.userId, { bio: bio.trim() || null });
    if (result.ok) revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "saveBioAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export interface SaveInfoInput {
  readonly displayName?: string;
  readonly location?: string;
  readonly seekingTimeline?: string;
  readonly bio?: string;
  readonly desiredCategories?: string[];
  readonly generalSkills?: string[];
}

export async function saveInfoAction(input: SaveInfoInput): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };

    // Each resume step saves only the fields it owns. Preserve every omitted
    // field so saving Skills cannot erase Info (and saving Info cannot erase
    // Skills). Explicit blank values still clear the corresponding field.
    const infoInput: SeekerProfileInfoInput = {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName.trim() || null }
        : {}),
      ...(input.location !== undefined
        ? { location: input.location.trim() || null }
        : {}),
      ...(input.seekingTimeline !== undefined
        ? {
            seekingTimeline: VALID_TIMELINES.has(input.seekingTimeline)
              ? input.seekingTimeline
              : null,
          }
        : {}),
      ...(input.desiredCategories !== undefined
        ? { desiredCategories: input.desiredCategories }
        : {}),
      ...(input.generalSkills !== undefined
        ? { generalSkills: input.generalSkills.slice(0, 10) }
        : {}),
    };

    const [infoResult, bioResult] = await Promise.all([
      updateSeekerProfileInfo(session.token, session.userId, infoInput),
      input.bio !== undefined
        ? updateSeekerProfileBio(session.token, session.userId, { bio: input.bio.trim() || null })
        : Promise.resolve({ ok: true }),
    ]);

    if (!infoResult.ok) return infoResult;
    if (!bioResult.ok) return bioResult;

    revalidate();
    // desiredCategories / generalSkills are ADR-040 engine inputs — refresh
    // the seeker's stored scores fire-and-forget so every pill stays honest.
    queueSeekerMatchRecompute(session.userId);
    return { ok: true };
  } catch (error) {
    reportError(error, { action: "saveInfoAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function addExperienceAction(
  input: ResumeExperienceInput,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const sanitized = sanitizedExperienceInput(input);
    if (!hasResumeExperienceIdentity(sanitized)) {
      return { ok: false, error: RESUME_EXPERIENCE_IDENTITY_REQUIRED };
    }
    const result = await addResumeExperience(
      session.token,
      session.userId,
      sanitized,
    );
    if (!result.ok) {
      return reportPersistenceFailure("addExperienceAction", result.error);
    }
    revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "addExperienceAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function updateExperienceAction(
  id: string,
  input: ResumeExperienceInput,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const sanitized = sanitizedExperienceInput(input);
    if (!hasResumeExperienceIdentity(sanitized)) {
      return { ok: false, error: RESUME_EXPERIENCE_IDENTITY_REQUIRED };
    }
    const result = await updateResumeExperience(
      session.token,
      session.userId,
      id,
      sanitized,
    );
    if (!result.ok) {
      return reportPersistenceFailure("updateExperienceAction", result.error);
    }
    revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "updateExperienceAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function deleteExperienceAction(id: string): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await deleteResumeExperience(session.token, session.userId, id);
    if (result.ok) revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "deleteExperienceAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function addEducationAction(
  input: ResumeEducationInput,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await addResumeEducation(session.token, session.userId, input);
    if (result.ok) revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "addEducationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function updateEducationAction(
  id: string,
  input: ResumeEducationInput,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await updateResumeEducation(session.token, session.userId, id, input);
    if (result.ok) revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "updateEducationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function deleteEducationAction(id: string): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await deleteResumeEducation(session.token, session.userId, id);
    if (result.ok) revalidate();
    return result;
  } catch (error) {
    reportError(error, { action: "deleteEducationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function addCertificationAction(
  input: ResumeCertificationInput,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await addSeekerCertification(session.token, session.userId, input);
    if (result.ok) {
      revalidate();
      // Certifications gate the engine's cert cap — rescore on change.
      queueSeekerMatchRecompute(session.userId);
    }
    return result;
  } catch (error) {
    reportError(error, { action: "addCertificationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function updateCertificationAction(
  id: string,
  input: Partial<ResumeCertificationInput>,
): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await updateSeekerCertification(session.token, session.userId, id, input);
    if (result.ok) {
      revalidate();
      queueSeekerMatchRecompute(session.userId);
    }
    return result;
  } catch (error) {
    reportError(error, { action: "updateCertificationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}

export async function deleteCertificationAction(id: string): Promise<ResumeActionResult> {
  try {
    const session = await getAuth();
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await deleteSeekerCertification(session.token, session.userId, id);
    if (result.ok) {
      revalidate();
      queueSeekerMatchRecompute(session.userId);
    }
    return result;
  } catch (error) {
    reportError(error, { action: "deleteCertificationAction" });
    return { ok: false, error: "unexpected_error" };
  }
}
