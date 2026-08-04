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

function isIdentifier(node, value) {
  return ts.isIdentifier(node) && node.text === value;
}

function hasIdentifier(node, value) {
  if (!node) return false;
  if (isIdentifier(node, value)) return true;
  return (
    ts.forEachChild(node, (child) =>
      hasIdentifier(child, value) ? true : undefined,
    ) === true
  );
}

function isNextBuildArgs(node, withPackageManagerEntry) {
  if (!node || !ts.isArrayLiteralExpression(node)) return false;
  const expected = withPackageManagerEntry
    ? ["packageManagerEntry", "exec", "next", "build"]
    : ["exec", "next", "build"];

  return (
    node.elements.length === expected.length &&
    node.elements.every((element, index) =>
      index === 0 && withPackageManagerEntry
        ? isIdentifier(element, expected[index])
        : isStringLiteral(element, expected[index]),
    )
  );
}

function hasExplicitHeapLimitContract(node) {
  return (
    !!node &&
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "test" &&
    ts.isRegularExpressionLiteral(node.expression.expression) &&
    node.expression.expression.text.includes("max[-_]old[-_]space[-_]size") &&
    node.arguments.length === 1 &&
    isIdentifier(node.arguments[0], "existingNodeOptions")
  );
}

function nodeOptionsContract(node) {
  return (
    !!node &&
    ts.isConditionalExpression(node) &&
    isIdentifier(node.condition, "hasExplicitHeapLimit") &&
    isIdentifier(node.whenTrue, "existingNodeOptions") &&
    hasIdentifier(node.whenFalse, "existingNodeOptions") &&
    hasIdentifier(node.whenFalse, "DEFAULT_BUILD_HEAP_MB")
  );
}

function argsContract(node) {
  return (
    !!node &&
    ts.isConditionalExpression(node) &&
    isIdentifier(node.condition, "packageManagerEntry") &&
    isNextBuildArgs(node.whenTrue, true) &&
    isNextBuildArgs(node.whenFalse, false)
  );
}

function spawnContract(node) {
  if (
    !node ||
    !ts.isCallExpression(node) ||
    !isIdentifier(node.expression, "spawnSync") ||
    !isIdentifier(node.arguments[0], "command") ||
    !isIdentifier(node.arguments[1], "args")
  ) {
    return false;
  }

  const options = node.arguments[2];
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const envProperty = options.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === "env") ||
        (ts.isStringLiteralLike(property.name) && property.name.text === "env")),
  );
  if (!envProperty || !ts.isPropertyAssignment(envProperty)) return false;
  if (!ts.isObjectLiteralExpression(envProperty.initializer)) return false;

  return envProperty.initializer.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === "NODE_OPTIONS") ||
        (ts.isStringLiteralLike(property.name) && property.name.text === "NODE_OPTIONS")) &&
      isIdentifier(property.initializer, "nodeOptions"),
  );
}

function buildCommandContract(command) {
  if (typeof command !== "string" || /(?:\|\||;|\r|\n)/.test(command)) {
    return false;
  }

  const commands = command.split(/\s*&&\s*/).map((part) => part.trim());
  if (commands.some((part) => part.length === 0 || /[|;&]/.test(part))) {
    return false;
  }

  const runnerPattern =
    /^node(?:\.exe)?\s+(["']?)\.\.\/\.\.\/tools\/scripts\/run-web-next-build\.mjs\1$/;
  return commands.filter((part) => runnerPattern.test(part)).length === 1;
}

if (!existsSync(PACKAGE_FILE) || !existsSync(RUNNER_FILE)) {
  violations.push("web build runner or package contract is missing");
} else {
  const pkg = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
  const runner = readFileSync(RUNNER_FILE, "utf8");
  if (!buildCommandContract(pkg.scripts?.build)) {
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
  if (!hasExplicitHeapLimitContract(declarations.get("hasExplicitHeapLimit"))) {
    violations.push("web build runner must declare explicit heap-limit detection");
  }

  if (!nodeOptionsContract(declarations.get("nodeOptions"))) {
    violations.push("web build runner must apply its 4096 MB heap floor");
  }

  const args = declarations.get("args");
  if (!argsContract(args)) {
    violations.push("web build runner must declare portable Next build arguments");
  }

  if (!spawnContract(declarations.get("result"))) {
    violations.push("web build runner must pass its arguments and heap options to spawnSync");
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`build-runtime: ${violation}`);
  process.exit(1);
}

console.log("build-runtime: Next build has a portable 4 GB heap floor OK");
