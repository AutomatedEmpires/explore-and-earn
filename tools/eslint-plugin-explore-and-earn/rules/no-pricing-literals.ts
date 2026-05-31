export default {
  meta: {
    name: "no-pricing-literals"
  },
  create() {
    // TODO: Implement canonical pricing literal detection after the guardrail
    // plugin is wired into the shared ESLint config.
    return {};
  }
};