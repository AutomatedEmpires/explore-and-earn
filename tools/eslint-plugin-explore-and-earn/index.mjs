import categoryTaxonomyLock from "./rules/category-taxonomy-lock.mjs";

export default {
  meta: {
    name: "@explore-and-earn/eslint-plugin"
  },
  rules: {
    "category-taxonomy-lock": categoryTaxonomyLock
  }
};