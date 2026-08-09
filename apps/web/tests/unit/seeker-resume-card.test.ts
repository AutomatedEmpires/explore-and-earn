import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SeekerResume } from "@explore-and-earn/db";

import { SeekerResumeCard } from "../../components/seeker/SeekerResumeCard";

describe("SeekerResumeCard legacy experience filtering", () => {
  it("does not render content or tags from an experience with no identity", () => {
    const resume: SeekerResume = {
      profile: null,
      experiences: [
        {
          id: "legacy-blank",
          companyName: "   ",
          roleTitle: null,
          location: "Private legacy location",
          startDate: "2025-06-01",
          endDate: null,
          isCurrent: true,
          summary: "Private legacy summary about operating a tractor.",
          categoryTags: ["farm"],
          skillTags: ["private-legacy-skill"],
        },
      ],
      educations: [],
      certifications: [],
    };

    const html = renderToStaticMarkup(
      createElement(SeekerResumeCard, { resume }),
    );

    expect(html).toContain("Resume not yet completed.");
    expect(html).not.toContain("Private legacy location");
    expect(html).not.toContain("Private legacy summary");
    expect(html).not.toContain("private-legacy-skill");
    expect(html).not.toContain('aria-label="Experience"');
  });

  it("renders a company-only legacy row with normalized identity fields", () => {
    const resume: SeekerResume = {
      profile: null,
      experiences: [
        {
          id: "legacy-company-only",
          companyName: "  Cascade Orchard\u3000",
          roleTitle: "\u3000\t",
          location: null,
          startDate: null,
          endDate: null,
          isCurrent: false,
          summary: null,
          categoryTags: [],
          skillTags: [],
        },
      ],
      educations: [],
      certifications: [],
    };

    const html = renderToStaticMarkup(
      createElement(SeekerResumeCard, { resume }),
    );

    expect(html).toContain('aria-label="Experience"');
    expect(html).toContain("Cascade Orchard");
    expect(html).not.toContain("  Cascade Orchard");
    expect(html).not.toContain("\u3000");
    expect(html).not.toContain("\t");
  });
});
