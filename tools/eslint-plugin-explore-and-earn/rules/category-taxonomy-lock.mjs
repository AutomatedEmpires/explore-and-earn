import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const enumFilePath = fileURLToPath(
  new URL("../../../packages/contracts/src/enums.ts", import.meta.url)
);
const categorySource = readFileSync(enumFilePath, "utf8");
const categoryArrayMatch = categorySource.match(
  /export const MARKETPLACE_CATEGORIES = \[(?<body>[\s\S]*?)\] as const;/
);

if (!categoryArrayMatch?.groups?.body) {
  throw new Error("Unable to load MARKETPLACE_CATEGORIES from packages/contracts/src/enums.ts");
}

const MARKETPLACE_CATEGORIES = [
  ...categoryArrayMatch.groups.body.matchAll(/"(?<value>[^"]+)"/g)
].map((match) => match.groups.value);
const MARKETPLACE_CATEGORY_SET = new Set(MARKETPLACE_CATEGORIES);
const BLOCKLIST_TOKENS = ["icon", "label", "title", "copy", "token", "accent", "key"];
const WRAPPER_TYPES = new Set([
  "ChainExpression",
  "JSXExpressionContainer",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression"
]);

function normalizeName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function getStaticName(node) {
  if (!node) {
    return null;
  }

  if (node.type === "Identifier" || node.type === "PrivateIdentifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }

  if (node.type === "MemberExpression" && !node.computed) {
    return getStaticName(node.property);
  }

  if (node.type === "MemberExpression" && node.computed) {
    return getStaticName(node.property);
  }

  return null;
}

function isCategoryName(name) {
  if (!name) {
    return false;
  }

  const normalized = normalizeName(name);

  if (!normalized.includes("category")) {
    return false;
  }

  if (BLOCKLIST_TOKENS.some((token) => normalized.includes(token))) {
    return false;
  }

  return (
    normalized === "category" ||
    normalized === "categories" ||
    normalized.startsWith("category") ||
    normalized.startsWith("categories") ||
    normalized.endsWith("category") ||
    normalized.endsWith("categories") ||
    normalized.includes("marketplacecategory")
  );
}

function unwrap(node) {
  let current = node;
  let parent = node.parent;

  while (parent && WRAPPER_TYPES.has(parent.type)) {
    current = parent;
    parent = parent.parent;
  }

  return { current, parent };
}

function isCategoryTarget(node) {
  return isCategoryName(getStaticName(node));
}

function isCategoryContext(node) {
  const { current, parent } = unwrap(node);

  if (!parent) {
    return false;
  }

  if ((parent.type === "Property" || parent.type === "PropertyDefinition") && parent.value === current) {
    return isCategoryTarget(parent.key);
  }

  if (parent.type === "JSXAttribute" && parent.value === current) {
    return isCategoryTarget(parent.name);
  }

  if (parent.type === "VariableDeclarator" && parent.init === current) {
    return isCategoryTarget(parent.id);
  }

  if (parent.type === "AssignmentExpression" && parent.right === current) {
    return isCategoryTarget(parent.left);
  }

  if (parent.type === "ArrayExpression" && parent.elements.includes(current)) {
    return isCategoryContext(parent);
  }

  if (parent.type === "CallExpression" && parent.arguments.includes(current)) {
    return isCategoryTarget(parent.callee);
  }

  if (
    parent.type === "BinaryExpression" &&
    (parent.left === current || parent.right === current)
  ) {
    const otherSide = parent.left === current ? parent.right : parent.left;
    return isCategoryTarget(otherSide);
  }

  if (
    parent.type === "ConditionalExpression" &&
    (parent.consequent === current || parent.alternate === current)
  ) {
    return isCategoryContext(parent);
  }

  return false;
}

function getLiteralValue(node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }

  return null;
}

function getCategoryToken(value) {
  if (value.startsWith("category.")) {
    return value.slice("category.".length);
  }

  return value;
}

function reportIfInvalid(node, context) {
  const value = getLiteralValue(node);
  const categoryToken = value ? getCategoryToken(value) : null;

  if (!value || !categoryToken) {
    return;
  }

  const isCompositeCategoryKey = value.startsWith("category.");
  const shouldValidate = isCompositeCategoryKey || isCategoryContext(node);

  if (!shouldValidate || MARKETPLACE_CATEGORY_SET.has(categoryToken)) {
    return;
  }

  context.report({
    node,
    messageId: categoryToken === "lodge" ? "lodgeCategory" : "invalidCategory",
    data: {
      category: categoryToken,
      allowed: MARKETPLACE_CATEGORIES.join(", ")
    }
  });
}

export default {
  meta: {
    name: "category-taxonomy-lock",
    type: "problem",
    schema: [],
    messages: {
      invalidCategory:
        'G019: category "{{category}}" is not canonical. Use one of: {{allowed}}.',
      lodgeCategory:
        'G019: "lodge" is not a top-level category. Model it as a seasonal setting and use one of: {{allowed}}.'
    }
  },
  create(context) {
    return {
      Literal(node) {
        reportIfInvalid(node, context);
      },
      TemplateLiteral(node) {
        reportIfInvalid(node, context);
      }
    };
  }
};