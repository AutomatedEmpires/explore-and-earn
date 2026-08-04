import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const PACKAGE_FILE = "apps/web/package.json";
const RUNNER_FILE = "tools/scripts/run-web-next-build.mjs";
const violations = [];

function getTopLevelDeclarations(sourceFile) {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declarations.set(declaration.name.text, declaration.initializer);
      }
    }
  }

  return declarations;
}

function isStringLiteral(node, value) {
  return ts.isStringLiteralLike(node) && node.text === value;
}

function hasNextBuildArgs(node, withPackageManagerEntry) {
  if (!node) return false;
  if (ts.isArrayLiteralExpression(node)) {
    const expected = withPackageManagerEntry
      ? ["packageManagerEntry", "exec", "next", "build"]
      : ["exec", "next", "build"];

    return (
      node.elements.length === expected.length &&
      node.elements.every((element, index) =>
        index === 0 && withPackageManagerEntry
          ? ts.isIdentifier(element) && element.text === expected[index]
          : isStringLiteral(element, expected[index]),
      )
    );
  }

  return ts.forEachChild(node, (child) =>
    hasNextBuildArgs(child, withPackageManagerEntry) ? true : undefined,
  ) === true;
}

if (!existsSync(PACKAGE_FILE) || !existsSync(RUNNER_FILE)) {
  violations.push("web build runner or package contract is missing");
} else {
  const pkg = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
  const runner = readFileSync(RUNNER_FILE, "utf8");
  const buildCommands = pkg.scripts?.build?.split(/\s*(?:&&|\|\||;)\s*/) ?? [];
  if (
    !buildCommands.some((command) =>
      /^node(?:\.exe)?\s+(["']?)(?:\.\.\/)+tools\/scripts\/run-web-next-build\.mjs\1(?:\s|$)/.test(
        command,
      ),
    )
  ) {
    violations.push("apps/web build must execute the bounded-memory Next runner");
  }

  const sourceFile = ts.createSourceFile(
    RUNNER_FILE,
    runner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declarations = getTopLevelDeclarations(sourceFile);
  const defaultHeap = declarations.get("DEFAULT_BUILD_HEAP_MB");
  if (
    !defaultHeap ||
    !ts.isNumericLiteral(defaultHeap) ||
    defaultHeap.text !== "4096"
  ) {
    violations.push("web build runner must declare a 4096 MB default heap");
  }
  if (!declarations.get("hasExplicitHeapLimit")) {
    violations.push("web build runner must declare explicit heap-limit detection");
  }

  const args = declarations.get("args");
  if (!hasNextBuildArgs(args, true) || !hasNextBuildArgs(args, false)) {
    violations.push("web build runner must declare portable Next build arguments");
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`build-runtime: ${violation}`);
  process.exit(1);
}

console.log("build-runtime: Next build has a portable 4 GB heap floor OK");
