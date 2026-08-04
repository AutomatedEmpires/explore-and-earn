import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep, basename } from "node:path";
import ts from "typescript";

/**
 * check-dev-bench.mjs (guardrail G040)
 *
 * The Dev Mock Bench (apps/web/lib/devBench) is REVIEW TOOLING ONLY. It must be
 * impossible to enable in a deployed (production or Vercel preview) build.
 * This read-only guardrail enforces the invariants below so CI /
 * `pnpm guardrails` blocks any drift:
 *
 *   1. The gate keeps both fail-closed checks: isDevBenchEnabled() requires
 *      `process.env.NODE_ENV !== "production"` AND an explicit local
 *      `NEXT_PUBLIC_DEV_BENCH === "1"` opt-in.
 *
 *   2. No COMMITTED env file enables the flag. Local, git-ignored `.env.local`
 *      files are the only place where the explicit opt-in belongs.
 *
 * This script never edits files. It exits non-zero on a violation.
 */

const GATE_FILE = "apps/web/lib/devBench/index.ts";
const MIDDLEWARE_FILE = "apps/web/middleware.ts";
const SURFACES_FILE = "apps/web/components/dev/surfaces.ts";
const DISCOVERY_DATA_FILE = "apps/web/components/discovery/data.ts";
const FLAG = "NEXT_PUBLIC_DEV_BENCH";
const GATE_GUARD = `process.env.NODE_ENV !== "production"`;
const OPT_IN_GUARD = `process.env.${FLAG} === "1"`;
const PUBLIC_ENTRY = "/dev";
const REQUIRED_REVIEW_SURFACES = [
  "/dev/catalog",
  "/for-seekers",
  "/host/plans",
  "/listing/lst_sourced_kelp_farm",
  "/refunds",
  "/sourced-listings",
  "/team/accept",
];

const ROOTS = ["apps", "packages", "tools", "docs", "."];
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", "build", ".git"]);

const violations = [];

function parseSource(name, source) {
  return ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function parseModule(file) {
  return parseSource(file, readFileSync(file, "utf8"));
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function findVariable(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration;
      }
    }
  }
  return undefined;
}

function findFunction(sourceFile, name) {
  return sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

function visit(node, predicate) {
  if (predicate(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && visit(child, predicate)) found = true;
  });
  return found;
}

function isEnvComparison(sourceFile, node, envName, operator, value) {
  const comparison = unwrapExpression(node);
  if (
    !comparison ||
    !ts.isBinaryExpression(comparison) ||
    comparison.operatorToken.kind !== operator
  ) {
    return false;
  }
  const left = unwrapExpression(comparison.left);
  const right = unwrapExpression(comparison.right);
  return (
    left?.getText(sourceFile) === `process.env.${envName}` &&
    right !== undefined &&
    ts.isStringLiteralLike(right) &&
    right.text === value
  );
}

function flattenLogicalAnd(expression) {
  const current = unwrapExpression(expression);
  if (
    current &&
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    return [
      ...flattenLogicalAnd(current.left),
      ...flattenLogicalAnd(current.right),
    ];
  }
  return current ? [current] : [];
}

function functionReturnsRequiredGate(sourceFile) {
  const declaration = findFunction(sourceFile, "isDevBenchEnabled");
  const statements = declaration?.body?.statements ?? [];
  if (statements.length !== 1 || !ts.isReturnStatement(statements[0])) {
    return false;
  }
  const [returnStatement] = statements;
  if (!returnStatement.expression) return false;

  const expression = unwrapExpression(returnStatement.expression);
  if (
    !expression ||
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    return false;
  }

  const terms = flattenLogicalAnd(expression);
  return (
    terms.some((term) =>
      isEnvComparison(
        sourceFile,
        term,
        "NODE_ENV",
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        "production",
      ),
    ) &&
    terms.some((term) =>
      isEnvComparison(
        sourceFile,
        term,
        FLAG,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        "1",
      ),
    )
  );
}

function createRouteMatcherEntries(sourceFile, variableName) {
  const declaration = findVariable(sourceFile, variableName);
  const initializer = unwrapExpression(declaration?.initializer);
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== "createRouteMatcher"
  ) {
    return [];
  }
  const routes = unwrapExpression(initializer.arguments[0]);
  if (!routes || !ts.isArrayLiteralExpression(routes)) return [];
  return routes.elements
    .map(unwrapExpression)
    .filter(ts.isStringLiteralLike)
    .map((route) => route.text);
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text
    : undefined;
}

function stringPropertiesWithin(node, name) {
  const values = [];
  visit(node, (candidate) => {
    if (
      ts.isPropertyAssignment(candidate) &&
      propertyName(candidate.name) === name
    ) {
      const initializer = unwrapExpression(candidate.initializer);
      if (initializer && ts.isStringLiteralLike(initializer)) {
        values.push(initializer.text);
      }
    }
    return false;
  });
  return values;
}

function hasNamedImport(sourceFile, moduleName, importName) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((element) => element.name.text === importName)
    );
  });
}

function hasNamedMapCall(node, objectName) {
  return visit(node, (candidate) => {
    if (!ts.isCallExpression(candidate)) return false;
    const expression = unwrapExpression(candidate.expression);
    return (
      expression &&
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === objectName &&
      expression.name.text === "map"
    );
  });
}

function isDevBenchCall(expression) {
  const candidate = unwrapExpression(expression);
  return (
    candidate &&
    ts.isCallExpression(candidate) &&
    ts.isIdentifier(candidate.expression) &&
    candidate.expression.text === "isDevBenchEnabled" &&
    candidate.arguments.length === 0
  );
}

function returnsBoolean(statement, expected) {
  if (ts.isReturnStatement(statement)) {
    return statement.expression?.kind ===
      (expected ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword);
  }
  return (
    ts.isBlock(statement) &&
    statement.statements.some((child) => returnsBoolean(child, expected))
  );
}

function functionHasDevBenchReturn(sourceFile, functionName, expected) {
  const declaration = findFunction(sourceFile, functionName);
  return Boolean(
    declaration?.body?.statements.some(
      (statement) =>
        ts.isIfStatement(statement) &&
        isDevBenchCall(statement.expression) &&
        returnsBoolean(statement.thenStatement, expected),
    ),
  );
}

function isDevRoleCookieRead(node) {
  const candidate = unwrapExpression(node);
  if (!candidate || !ts.isCallExpression(candidate)) return false;
  const expression = unwrapExpression(candidate.expression);
  if (
    !expression ||
    !ts.isPropertyAccessExpression(expression) ||
    expression.name.text !== "get"
  ) {
    return false;
  }
  const cookies = unwrapExpression(expression.expression);
  const argument = unwrapExpression(candidate.arguments[0]);
  return Boolean(
    cookies &&
      ts.isPropertyAccessExpression(cookies) &&
      ts.isIdentifier(cookies.expression) &&
      cookies.expression.text === "request" &&
      cookies.name.text === "cookies" &&
      argument &&
      ts.isIdentifier(argument) &&
      argument.text === "DEV_ROLE_COOKIE",
  );
}

function isConfiguredClerkReturn(statement) {
  if (!ts.isReturnStatement(statement)) return false;
  const expression = unwrapExpression(statement.expression);
  return (
    expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "configuredClerkMiddleware"
  );
}

function definitelyReturns(statement) {
  if (ts.isReturnStatement(statement)) return true;
  if (ts.isBlock(statement)) {
    const last = statement.statements.at(-1);
    return last ? definitelyReturns(last) : false;
  }
  return (
    ts.isIfStatement(statement) &&
    statement.elseStatement !== undefined &&
    definitelyReturns(statement.thenStatement) &&
    definitelyReturns(statement.elseStatement)
  );
}

function wrapperHasPreClerkBypass(sourceFile) {
  const wrapper = findFunction(sourceFile, "devBenchAwareClerkMiddleware");
  const statements = wrapper?.body?.statements ?? [];
  const roleGate = statements.findIndex((statement) => {
    if (!ts.isIfStatement(statement)) return false;
    const expression = unwrapExpression(statement.expression);
    if (
      !expression ||
      !ts.isBinaryExpression(expression) ||
      expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return false;
    }
    const terms = flattenLogicalAnd(expression);
    return (
      terms.some(isDevBenchCall) &&
      terms.some(isDevRoleCookieRead) &&
      definitelyReturns(statement.thenStatement)
    );
  });
  const clerkDelegate = statements.findIndex(isConfiguredClerkReturn);
  return roleGate === 0 && clerkDelegate === statements.length - 1;
}

function verifyParserFixtures() {
  const safeGate = parseSource(
    "safe-gate.ts",
    `function isDevBenchEnabled() {
      return process.env.NODE_ENV !== "production" &&
        process.env.NEXT_PUBLIC_DEV_BENCH === "1";
    }`,
  );
  const deadGate = parseSource(
    "dead-gate.ts",
    `function isDevBenchEnabled() {
      process.env.NODE_ENV !== "production";
      process.env.NEXT_PUBLIC_DEV_BENCH === "1";
      return true;
    }`,
  );
  const orGate = parseSource(
    "or-gate.ts",
    `function isDevBenchEnabled() {
      return process.env.NODE_ENV !== "production" ||
        process.env.NEXT_PUBLIC_DEV_BENCH === "1";
    }`,
  );
  const earlyGate = parseSource(
    "early-gate.ts",
    `function isDevBenchEnabled() {
      if (process.env.ALLOW_UNSAFE === "1") return true;
      return process.env.NODE_ENV !== "production" &&
        process.env.NEXT_PUBLIC_DEV_BENCH === "1";
    }`,
  );
  if (
    !functionReturnsRequiredGate(safeGate) ||
    functionReturnsRequiredGate(deadGate) ||
    functionReturnsRequiredGate(orGate) ||
    functionReturnsRequiredGate(earlyGate)
  ) {
    violations.push(
      "G040 internal: gate parser must reject dead or disjunctive env checks",
    );
  }

  const safeWrapper = parseSource(
    "safe-wrapper.ts",
    `function devBenchAwareClerkMiddleware(request, event) {
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        return NextResponse.next();
      }
      return configuredClerkMiddleware(request, event);
    }`,
  );
  const orWrapper = parseSource(
    "or-wrapper.ts",
    `function devBenchAwareClerkMiddleware(request, event) {
      if (isDevBenchEnabled() || request.cookies.get(DEV_ROLE_COOKIE)) {
        return NextResponse.next();
      }
      return configuredClerkMiddleware(request, event);
    }`,
  );
  const noReturnWrapper = parseSource(
    "no-return-wrapper.ts",
    `function devBenchAwareClerkMiddleware(request, event) {
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        NextResponse.next();
      }
      return configuredClerkMiddleware(request, event);
    }`,
  );
  const decoyWrapper = parseSource(
    "decoy-wrapper.ts",
    `function devBenchAwareClerkMiddleware(request, event) {
      // isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)
      "isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)";
      return configuredClerkMiddleware(request, event);
    }
    function later(request) {
      if (isDevBenchEnabled() && request.cookies.get(DEV_ROLE_COOKIE)) {
        return NextResponse.next();
      }
    }`,
  );
  if (
    !wrapperHasPreClerkBypass(safeWrapper) ||
    wrapperHasPreClerkBypass(orWrapper) ||
    wrapperHasPreClerkBypass(noReturnWrapper) ||
    wrapperHasPreClerkBypass(decoyWrapper)
  ) {
    violations.push(
      "G040 internal: middleware parser must reject OR, non-returning, or decoy bypasses",
    );
  }
}

verifyParserFixtures();

// --- Invariant 1: the production kill-switch is intact -----------------------
if (!existsSync(GATE_FILE)) {
  violations.push(`${GATE_FILE}  G040: dev-bench gate module is missing`);
} else {
  const sourceFile = parseModule(GATE_FILE);
  if (!functionReturnsRequiredGate(sourceFile)) {
    violations.push(
      `${GATE_FILE}  G040: isDevBenchEnabled() must gate on \`${GATE_GUARD}\` and \`${OPT_IN_GUARD}\``,
    );
  }
}

// --- Invariant 2: the local launcher is reachable before impersonation -------
// The launcher sets the role cookie, so middleware must not require that cookie
// before allowing /dev through. The page's NODE_ENV gate above still makes this
// route a 404 in every production/preview build.
if (!existsSync(MIDDLEWARE_FILE)) {
  violations.push(`${MIDDLEWARE_FILE}  G040: middleware is missing`);
} else {
  const middleware = parseModule(MIDDLEWARE_FILE);
  const publicMatcher = createRouteMatcherEntries(middleware, "isPublicRoute");

  if (!publicMatcher.includes(PUBLIC_ENTRY)) {
    violations.push(
      `${MIDDLEWARE_FILE}  G040: /dev must be public so the local role picker is reachable`,
    );
  }

  if (!wrapperHasPreClerkBypass(middleware)) {
    violations.push(
      `${MIDDLEWARE_FILE}  G040: an explicit dev role must return from an &&-gated branch before Clerk session refresh`,
    );
  }
}

// --- Invariant 3: the launcher covers deterministic review anchors ----------
if (!existsSync(SURFACES_FILE)) {
  violations.push(`${SURFACES_FILE}  G040: surface index is missing`);
} else {
  const surfaces = parseModule(SURFACES_FILE);
  const catalog = findVariable(surfaces, "DEV_SURFACES");
  const catalogInitializer = unwrapExpression(catalog?.initializer);
  const hrefs = catalogInitializer
    ? stringPropertiesWithin(catalogInitializer, "href")
    : [];
  for (const required of REQUIRED_REVIEW_SURFACES) {
    if (!hrefs.includes(required)) {
      violations.push(
        `${SURFACES_FILE}  G040: missing deterministic review surface ${JSON.stringify(required)}`,
      );
    }
  }
  if (
    !hasNamedImport(surfaces, "../demo/enterpriseDemo", "DEMO_SURFACES") ||
    !catalogInitializer ||
    !hasNamedMapCall(catalogInitializer, "DEMO_SURFACES")
  ) {
    violations.push(
      `${SURFACES_FILE}  G040: Enterprise demo routes must derive from canonical DEMO_SURFACES`,
    );
  }
}

// --- Invariant 4: review inventory stays deterministic ----------------------
// A developer may have local Supabase credentials present while the local
// stack is stopped. The bench must still render fixtures instead of hanging or
// throwing; only NEXT_PUBLIC_DEV_BENCH=1 selects this deterministic seam.
if (!existsSync(DISCOVERY_DATA_FILE)) {
  violations.push(`${DISCOVERY_DATA_FILE}  G040: discovery data seam is missing`);
} else {
  const discoveryData = parseModule(DISCOVERY_DATA_FILE);
  if (
    !functionHasDevBenchReturn(
      discoveryData,
      "canUseDiscoveryFixtureFallback",
      true,
    )
  ) {
    violations.push(
      `${DISCOVERY_DATA_FILE}  G040: dev bench must force deterministic discovery fixtures`,
    );
  }
  if (
    !functionHasDevBenchReturn(
      discoveryData,
      "hasDiscoveryPublicDataConfig",
      false,
    )
  ) {
    violations.push(
      `${DISCOVERY_DATA_FILE}  G040: dev bench must suppress configured live discovery data`,
    );
  }
}

// --- Invariant 5: committed env files never enable the bench -----------------
// A committed env file may set the flag only to "0" (force-off). Local
// `*.local` env files are git-ignored, so they are not scanned.
function isScannableEnvFile(name) {
  if (name.endsWith(".local")) return false;
  return name === ".env.example" || name === ".env" || name.startsWith(".env.");
}

function walkEnvFiles(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkEnvFiles(full, out);
    } else if (isScannableEnvFile(basename(full))) {
      out.push(full);
    }
  }
  return out;
}

const seen = new Set();
for (const root of ROOTS) {
  for (const file of walkEnvFiles(root)) {
    const posix = file.split(sep).join("/").replace(/^\.\//, "");
    if (seen.has(posix)) continue;
    seen.add(posix);

    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return; // commented example — allowed
      const match = trimmed.match(new RegExp(`^${FLAG}\\s*=\\s*(.*)$`));
      if (!match) return;
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      if (value !== "" && value !== "0") {
        violations.push(
          `${posix}:${i + 1}  G040: ${FLAG} must never be committed enabled (found "${value}"; only "0"/unset allowed)`,
        );
      }
    });
  }
}

// --- Report ------------------------------------------------------------------
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  console.error(
    `\ndev-bench: FAILED with ${violations.length} violation(s). The mock bench is ` +
      `dev-only tooling and must never be enable-able in a deployed build.`,
  );
  process.exit(1);
}

console.log(
  "dev-bench: production kill intact, launcher reachable and indexed, no committed env enables the bench OK",
);
