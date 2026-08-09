import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RESUME_EXPERIENCE_IDENTITY_REQUIRED,
  RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE,
} from "@explore-and-earn/contracts";
import type { ResumeDraft } from "@explore-and-earn/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  addResumeEducation: vi.fn(),
  addResumeExperience: vi.fn(),
  addSeekerCertification: vi.fn(),
  updateSeekerProfileBio: vi.fn(),
  updateSeekerProfileInfo: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: rateLimitMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import { saveImportedResumeAction } from "../../app/actions/resumeImport";
import {
  applyResumeImportSaveResult,
  OUTCOME_UNKNOWN_MESSAGE,
  PARTIAL_SAVE_MESSAGE,
  ResumeImportNotice,
  ReviewPanel,
} from "../../components/seeker/ResumeImport";

const VALID_EXPERIENCE = {
  roleTitle: "Trail guide",
  companyName: null,
  location: null,
  startDate: null,
  endDate: null,
  isCurrent: false,
  summary: undefined,
  categoryTags: [],
  skillTags: [],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-seeker",
    getToken: vi.fn().mockResolvedValue("session-token"),
  });
  rateLimitMock.mockResolvedValue({ allowed: true });
  dbMocks.addResumeEducation.mockResolvedValue({ ok: true, id: "education-1" });
  dbMocks.addResumeExperience.mockResolvedValue({ ok: true, id: "experience-1" });
  dbMocks.addSeekerCertification.mockResolvedValue({
    ok: true,
    id: "certification-1",
  });
  dbMocks.updateSeekerProfileBio.mockResolvedValue({ ok: true });
  dbMocks.updateSeekerProfileInfo.mockResolvedValue({ ok: true });
});

describe("saveImportedResumeAction experience preflight", () => {
  it("keeps authentication precedence over identity validation", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: vi.fn() });

    await expect(
      saveImportedResumeAction({
        experiences: [{ roleTitle: " ", companyName: null }],
      }),
    ).resolves.toEqual({ ok: false, error: "unauthenticated" });
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
  });

  it("keeps a thrown pre-write failure retryable", async () => {
    authMock.mockRejectedValueOnce(new Error("authentication unavailable"));

    await expect(
      saveImportedResumeAction({ experiences: [VALID_EXPERIENCE] }),
    ).resolves.toEqual({ ok: false, error: "unexpected_error" });
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("validates every included experience before any profile or row write", async () => {
    const draft: ResumeDraft = {
      profileInfo: {
        displayName: "Casey",
        location: "Bend, Oregon",
        seekingTimeline: "now",
        generalSkills: ["Guest service"],
        bio: "Ready for seasonal work.",
      },
      experiences: [
        VALID_EXPERIENCE,
        {
          roleTitle: "   ",
          companyName: "\t",
          summary: "Description without an identity",
        },
      ],
      educations: [{ institution: "Community College" }],
      certifications: [{ name: "First aid" }],
    };

    await expect(saveImportedResumeAction(draft)).resolves.toEqual({
      ok: false,
      error: RESUME_EXPERIENCE_IDENTITY_REQUIRED,
    });
    expect(dbMocks.updateSeekerProfileInfo).not.toHaveBeenCalled();
    expect(dbMocks.updateSeekerProfileBio).not.toHaveBeenCalled();
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
    expect(dbMocks.addResumeEducation).not.toHaveBeenCalled();
    expect(dbMocks.addSeekerCertification).not.toHaveBeenCalled();
  });

  it("trims both identity fields and persists explicit null for a missing role", async () => {
    await expect(
      saveImportedResumeAction({
        experiences: [
          {
            roleTitle: "  ",
            companyName: "  Cascade Orchard  ",
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      saved: { experiences: 1 },
    });

    expect(dbMocks.addResumeExperience).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      expect.objectContaining({
        roleTitle: null,
        companyName: "Cascade Orchard",
      }),
    );
  });

  it("stops on an experience write failure and conceals its raw error", async () => {
    dbMocks.addResumeExperience.mockResolvedValueOnce({
      ok: false,
      error: "raw database detail",
    });

    await expect(
      saveImportedResumeAction({
        experiences: [
          VALID_EXPERIENCE,
          { ...VALID_EXPERIENCE, roleTitle: "Farmhand" },
        ],
      }),
    ).resolves.toEqual({ ok: false, error: "unexpected_error" });
    expect(dbMocks.addResumeExperience).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it("returns an unknown outcome when a committed experience response rejects", async () => {
    let committedRows = 0;
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("resume revalidation unavailable");
    });
    dbMocks.addResumeExperience.mockImplementationOnce(async () => {
      committedRows += 1;
      throw new Error("response lost after commit");
    });

    await expect(
      saveImportedResumeAction({ experiences: [VALID_EXPERIENCE] }),
    ).resolves.toEqual({ ok: false, error: "outcome_unknown" });

    expect(committedRows).toBe(1);
    expect(dbMocks.addResumeExperience).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith("/resume");
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "response lost after commit" }),
      { action: "saveImportedResumeAction.outcomeUnknown" },
    );
  });

  it("returns exact partial counts when the second experience fails", async () => {
    dbMocks.addResumeExperience
      .mockResolvedValueOnce({ ok: true, id: "experience-1" })
      .mockResolvedValueOnce({ ok: false, error: "raw second-row detail" });

    await expect(
      saveImportedResumeAction({
        experiences: [
          VALID_EXPERIENCE,
          { ...VALID_EXPERIENCE, roleTitle: "Farmhand" },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "partial_save",
      saved: {
        profile: false,
        experiences: 1,
        educations: 0,
        certifications: 0,
      },
    });
    expect(dbMocks.addResumeExperience).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/resume");
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });

  it("returns partial counts when education fails after an experience write", async () => {
    dbMocks.addResumeEducation.mockResolvedValueOnce({
      ok: false,
      error: "raw education detail",
    });

    await expect(
      saveImportedResumeAction({
        experiences: [VALID_EXPERIENCE],
        educations: [{ institution: "Community College" }],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "partial_save",
      saved: {
        profile: false,
        experiences: 1,
        educations: 0,
        certifications: 0,
      },
    });
    expect(dbMocks.addSeekerCertification).not.toHaveBeenCalled();
  });

  it("returns all prior counts when certification persistence fails", async () => {
    dbMocks.addSeekerCertification.mockResolvedValueOnce({
      ok: false,
      error: "raw certification detail",
    });

    await expect(
      saveImportedResumeAction({
        experiences: [VALID_EXPERIENCE],
        educations: [{ institution: "Community College" }],
        certifications: [{ name: "First aid" }],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "partial_save",
      saved: {
        profile: false,
        experiences: 1,
        educations: 1,
        certifications: 0,
      },
    });
  });

  it("conceals profile persistence errors and does not continue to experience writes", async () => {
    dbMocks.updateSeekerProfileInfo.mockResolvedValue({
      ok: false,
      error: "raw profile detail",
    });

    await expect(
      saveImportedResumeAction({
        profileInfo: { displayName: "Casey" },
        experiences: [VALID_EXPERIENCE],
      }),
    ).resolves.toEqual({ ok: false, error: "unexpected_error" });
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });
});

type ReviewState = Parameters<typeof ReviewPanel>[0]["review"];

function reviewWithExperience(include: boolean): ReviewState {
  return {
    profile: {
      include: true,
      displayName: "Casey",
      location: "Bend, Oregon",
      seekingTimeline: "now",
      bio: "Ready for seasonal work.",
      generalSkills: [],
    },
    experiences: [
      {
        include,
        roleTitle: " ",
        companyName: "",
        location: "Wenatchee",
        summary: "Helped guests.",
        startDate: null,
        endDate: null,
        isCurrent: false,
        skillTags: [],
      },
    ],
    educations: [],
    certifications: [],
  };
}

function renderReview(review: ReviewState): string {
  return renderToStaticMarkup(
    createElement(ReviewPanel, {
      review,
      onChange: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      pending: false,
    }),
  );
}

function finalButtonTag(html: string): string {
  const start = html.lastIndexOf("<button");
  const end = html.indexOf(">", start);
  return html.slice(start, end + 1);
}

describe("import review experience identity", () => {
  it("blocks Save and ties both fields to one inline error for an included invalid row", () => {
    const html = renderReview(reviewWithExperience(true));
    const errorId = "resume-import-experience-0-identity-error";

    expect(html).toContain(RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE);
    expect(html.match(new RegExp(`aria-describedby="${errorId}"`, "g"))).toHaveLength(2);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(finalButtonTag(html)).toContain("disabled");
  });

  it("removes the identity block when the invalid row is excluded", () => {
    const html = renderReview(reviewWithExperience(false));

    expect(html).not.toContain(RESUME_EXPERIENCE_IDENTITY_REQUIRED_MESSAGE);
    expect(html).not.toContain("resume-import-experience-0-identity-error");
    expect(finalButtonTag(html)).not.toContain("disabled");
  });

  it("gives every inclusion checkbox a unique label and a 44px hit area", () => {
    const review = reviewWithExperience(true);
    review.experiences = [
      {
        ...review.experiences[0],
        roleTitle: "Trail guide",
        companyName: "Cascade Orchard",
      },
      {
        ...review.experiences[0],
        include: false,
        roleTitle: "",
        companyName: "Harbor Lodge",
      },
    ];
    review.educations = [
      {
        include: true,
        institution: "Cascade College",
        programOrDegree: "Hospitality certificate",
        location: "",
        description: "",
        startDate: null,
        endDate: null,
        isCurrent: false,
        skillTags: [],
      },
      {
        include: false,
        institution: "Desert Community College",
        programOrDegree: "",
        location: "",
        description: "",
        startDate: null,
        endDate: null,
        isCurrent: false,
        skillTags: [],
      },
    ];
    review.certifications = [
      {
        include: true,
        name: "First aid",
        issuingOrganization: "Red Cross",
        description: "",
        issuedAt: null,
        expiresAt: null,
        skillTags: [],
      },
      {
        include: false,
        name: "Food handler card",
        issuingOrganization: "",
        description: "",
        issuedAt: null,
        expiresAt: null,
        skillTags: [],
      },
    ];
    const html = renderReview(review);
    const css = readFileSync(
      new URL(
        "../../components/seeker/ResumeImport.module.css",
        import.meta.url,
      ),
      "utf8",
    );
    const tokens = readFileSync(
      new URL("../../styles/tokens.css", import.meta.url),
      "utf8",
    );

    expect(html).toContain(
      'aria-label="Include experience 1: Trail guide at Cascade Orchard"',
    );
    expect(html).toContain(
      'aria-label="Include experience 2: Harbor Lodge"',
    );
    expect(html).toContain('aria-label="Include profile details: Casey"');
    expect(html).toContain(
      'aria-label="Include education 1: Hospitality certificate at Cascade College"',
    );
    expect(html).toContain(
      'aria-label="Include education 2: Desert Community College"',
    );
    expect(html).toContain(
      'aria-label="Include certification 1: First aid from Red Cross"',
    );
    expect(html).toContain(
      'aria-label="Include certification 2: Food handler card"',
    );
    expect(
      html.match(
        /<label class="[^"]*includeToggle[^"]*"><input[^>]*type="checkbox"/g,
      ),
    ).toHaveLength(7);
    expect(css).toMatch(
      /\.includeToggle\s*{[^}]*width:\s*var\(--tap-min\);[^}]*min-width:\s*var\(--tap-min\);[^}]*min-height:\s*var\(--tap-min\);/s,
    );
    expect(tokens).toContain("--tap-min: 44px");
  });
});

describe("import partial-save UI contract", () => {
  it("refreshes and closes the review with an honest persistent alert", () => {
    const refresh = vi.fn();
    const reset = vi.fn();
    const closeReviewWithMessage = vi.fn();
    const showError = vi.fn();

    applyResumeImportSaveResult(
      {
        ok: false,
        error: "partial_save",
        saved: {
          profile: false,
          experiences: 1,
          educations: 0,
          certifications: 0,
        },
      },
      { refresh, reset, closeReviewWithMessage, showError },
    );

    expect(refresh).toHaveBeenCalledOnce();
    expect(closeReviewWithMessage).toHaveBeenCalledWith(PARTIAL_SAVE_MESSAGE);
    expect(reset).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();

    const notice = renderToStaticMarkup(
      createElement(ResumeImportNotice, { message: PARTIAL_SAVE_MESSAGE }),
    );
    expect(notice).toContain('role="alert"');
    expect(notice).toContain(PARTIAL_SAVE_MESSAGE);
  });

  it("refreshes and closes with cautious copy when the write outcome is unknown", () => {
    const refresh = vi.fn();
    const reset = vi.fn();
    const closeReviewWithMessage = vi.fn();
    const showError = vi.fn();

    applyResumeImportSaveResult(
      { ok: false, error: "outcome_unknown" },
      { refresh, reset, closeReviewWithMessage, showError },
    );

    expect(refresh).toHaveBeenCalledOnce();
    expect(closeReviewWithMessage).toHaveBeenCalledWith(
      OUTCOME_UNKNOWN_MESSAGE,
    );
    expect(OUTCOME_UNKNOWN_MESSAGE).toBe(
      "The import stopped while saving. Review the builder before importing again.",
    );
    expect(reset).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();

    const notice = renderToStaticMarkup(
      createElement(ResumeImportNotice, { message: OUTCOME_UNKNOWN_MESSAGE }),
    );
    expect(notice).toContain('role="alert"');
    expect(notice).toContain(OUTCOME_UNKNOWN_MESSAGE);
  });

  it("preserves the review for a zero-write failure", () => {
    const refresh = vi.fn();
    const reset = vi.fn();
    const closeReviewWithMessage = vi.fn();
    const showError = vi.fn();

    applyResumeImportSaveResult(
      { ok: false, error: "unexpected_error" },
      { refresh, reset, closeReviewWithMessage, showError },
    );

    expect(showError).toHaveBeenCalledWith(
      "Couldn't save everything. Please try again or fill the steps below.",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(closeReviewWithMessage).not.toHaveBeenCalled();
  });
});
