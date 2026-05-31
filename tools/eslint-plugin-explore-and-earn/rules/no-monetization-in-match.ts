export default {
  meta: {
    name: "no-monetization-in-match"
  },
  create() {
    // TODO: Prevent matching code from importing billing and boost modules.
    return {};
  }
};