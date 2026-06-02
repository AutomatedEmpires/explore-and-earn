import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import exploreAndEarnPlugin from "./tools/eslint-plugin-explore-and-earn/index.mjs";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "pnpm-lock.yaml"
    ]
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
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["apps/**/*.{js,mjs,cjs,ts,tsx}", "packages/**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: {
      "@explore-and-earn": exploreAndEarnPlugin
    },
    rules: {
      "@explore-and-earn/category-taxonomy-lock": "error"
    }
  }
);