// G-REFUND: Stripe refunds must go through the single approved boundary
// (apps/web/services/stripe/index.ts), which backs the refund_requests
// admin-approval flow (migration 047, packages/db/src/queries/refunds.ts).
// A direct `x.refunds.create(...)` call anywhere else bypasses that review
// step and issues real money with no audit trail.
const APPROVED_FILE = "apps/web/services/stripe/index.ts";

function isRefundsCreateCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type !== "MemberExpression") return false;
  if (callee.property.type !== "Identifier" || callee.property.name !== "create") return false;
  const object = callee.object;
  if (object.type !== "MemberExpression") return false;
  return object.property.type === "Identifier" && object.property.name === "refunds";
}

export default {
  meta: {
    name: "no-direct-stripe-refund",
    type: "problem",
    docs: {
      description: "Stripe refunds must go through apps/web/services/stripe/index.ts (the refund_requests approval boundary).",
    },
    schema: [],
    messages: {
      forbidden:
        "G-REFUND: call refund logic through apps/web/services/stripe/index.ts, not a direct Stripe refunds.create() call — refunds must go through the refund_requests admin-approval flow.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const normalized = filename.replace(/\\/g, "/");
    if (normalized.endsWith(APPROVED_FILE)) {
      return {};
    }
    return {
      CallExpression(node) {
        if (isRefundsCreateCall(node)) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};
