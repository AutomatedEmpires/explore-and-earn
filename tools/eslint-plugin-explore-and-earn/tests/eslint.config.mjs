import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import plugin from "../index.mjs";

export default tseslint.config(
  {
    ignores: []
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: {
      "@explore-and-earn": plugin
    },
    rules: {
      "@explore-and-earn/category-taxonomy-lock": "error",
      "no-console": "off"
    }
  }
);