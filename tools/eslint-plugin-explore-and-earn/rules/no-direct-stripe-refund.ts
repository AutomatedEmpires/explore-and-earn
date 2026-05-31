export default {
  meta: {
    name: "no-direct-stripe-refund"
  },
  create() {
    // TODO: Restrict direct refund calls to the future RefundReview boundary.
    return {};
  }
};