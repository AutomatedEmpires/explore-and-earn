import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../../app/[locale]/for-hosts/page.module.css", import.meta.url),
  "utf8",
);

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} rule is missing`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("for-hosts mobile layout", () => {
  it.each([".hero", ".previewWrap", ".flows", ".pricing", ".finalCta"])(
    "keeps the padded %s container inside the viewport",
    (selector) => {
      expect(ruleFor(selector)).toContain("box-sizing: border-box");
    },
  );
});
