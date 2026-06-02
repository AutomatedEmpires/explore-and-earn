import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const configPath = join(
  repoRoot,
  "tools/eslint-plugin-explore-and-earn/tests/eslint.config.mjs"
);
const fixtures = [
  {
    filePath: join(
      repoRoot,
      "tools/eslint-plugin-explore-and-earn/tests/fixtures/category-taxonomy-lock.pass.ts"
    ),
    shouldPass: true
  },
  {
    filePath: join(
      repoRoot,
      "tools/eslint-plugin-explore-and-earn/tests/fixtures/category-taxonomy-lock.fail.ts"
    ),
    shouldPass: false
  }
];

const eslint = new ESLint({
  cwd: repoRoot,
  ignore: false,
  overrideConfigFile: configPath
});

let hasFailure = false;

for (const fixture of fixtures) {
  const results = await eslint.lintFiles([fixture.filePath]);
  const errorCount = results.reduce(
    (total, result) => total + result.errorCount + result.fatalErrorCount,
    0
  );
  const categoryErrors = results.flatMap((result) =>
    result.messages.filter(
      (message) => message.ruleId === "@explore-and-earn/category-taxonomy-lock"
    )
  );

  if (fixture.shouldPass && errorCount > 0) {
    hasFailure = true;
    console.error(`G019 fixture failed unexpectedly: ${fixture.filePath}`);
  }

  if (!fixture.shouldPass && categoryErrors.length === 0) {
    hasFailure = true;
    console.error(`G019 fixture did not trip the guardrail: ${fixture.filePath}`);
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("category-taxonomy-check: fixtures matched expected pass/fail behavior");