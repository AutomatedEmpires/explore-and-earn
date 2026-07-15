import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const builderSource = readFileSync(
  new URL("../../components/seeker/ResumeBuilder.tsx", import.meta.url),
  "utf8",
);
const builderCss = readFileSync(
  new URL("../../components/seeker/ResumeBuilder.module.css", import.meta.url),
  "utf8",
);
const mainBuilder = builderSource.slice(
  builderSource.indexOf("export function ResumeBuilder"),
);

describe("resume step navigation contract", () => {
  it("keeps the single footer after the editor and before the live preview in DOM order", () => {
    const editorIndex = mainBuilder.indexOf("className={styles.editorPane}");
    const footerIndex = mainBuilder.indexOf("className={styles.stepFooter}");
    const previewIndex = mainBuilder.indexOf(
      "<ResumePreviewPane resume={previewResume}",
    );

    assert.ok(editorIndex >= 0, "editor pane is present");
    assert.ok(footerIndex > editorIndex, "footer follows the editor");
    assert.ok(previewIndex > footerIndex, "live preview follows the footer");
    assert.equal(
      mainBuilder.match(/className=\{styles\.stepFooter\}/g)?.length,
      1,
      "only one footer nav is rendered",
    );
  });

  it("uses grid areas to preserve the desktop two-column layout", () => {
    assert.match(
      builderCss,
      /grid-template-areas:\s*"editor"\s*"footer"\s*"preview"/,
    );
    assert.match(
      builderCss,
      /grid-template-areas:\s*"editor preview"\s*"footer footer"/,
    );
  });

  it("requires confirmation before a dirty draft can change steps", () => {
    assert.match(mainBuilder, /const \[draftDirty, setDraftDirty\] = useState\(false\)/);
    assert.match(
      mainBuilder,
      /if \(draftDirty && !window\.confirm\([\s\S]*?\)\) \{\s*return;\s*\}/,
    );
    assert.match(
      mainBuilder,
      /function clearPreviewDraft\(\)[\s\S]*?setPreviewDraft\(\{\}\);[\s\S]*?setDraftDirty\(false\);/,
    );
    assert.match(
      mainBuilder,
      /function updateProfileDraft[\s\S]*?setDraftKindDirty\("profile", draft !== undefined\);/,
    );
  });

  it("counts uncommitted custom-skill input as dirty typed data", () => {
    assert.match(builderSource, /onDraftInput\?: \(\) => void/);
    assert.match(
      builderSource,
      /onChange=\{\(e\) => \{\s*setDraft\(e\.target\.value\);\s*onDraftInput\?\.\(\);/,
    );
    assert.match(
      builderSource,
      /onChange=\{\(e\) => \{\s*setCustomDraft\(e\.target\.value\);\s*onDraftInput\?\.\(\);/,
    );
  });
});
