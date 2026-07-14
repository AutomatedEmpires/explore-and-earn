import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import exploreAndEarnPlugin from "./tools/eslint-plugin-explore-and-earn/index.ts";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.vercel/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.remember/**",
      // Compiled output of packages/db (emitted next to source by `tsc -b`);
      // every .js here has a .ts sibling — lint the source, not the build artifact.
      "packages/db/src/**/*.js",
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
    plugins: {
      "explore-and-earn": exploreAndEarnPlugin
    },
    rules: {
      "no-console": "off",
      // G-REFUND: the only rule in @explore-and-earn/eslint-plugin with a real
      // implementation — see tools/eslint-plugin-explore-and-earn/index.ts for
      // why the other five stay "off" (either superseded by a working
      // tools/scripts/check-*.mjs guardrail, or still an unimplemented stub).
      "explore-and-earn/no-direct-stripe-refund": "error",
      "explore-and-earn/no-pricing-literals": "off",
      "explore-and-earn/no-external-calendar-sync": "off",
      "explore-and-earn/no-lifecycle-string-literals": "off",
      "explore-and-earn/no-monetization-in-match": "off",
      "explore-and-earn/verified-host-via-component-only": "off",
      // G30 (ADR-044): one icon system only. Icons render through the
      // <Icon name="domain.name"/> registry (packages/ui), which is backed by
      // Phosphor. Ban every other icon library so the set can't drift.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "lucide-react", message: "G30: use <Icon> (packages/ui) — Phosphor is the only icon set." }
          ],
          patterns: [
            {
              group: [
                "@heroicons/*",
                "react-icons",
                "react-icons/*",
                "@fortawesome/*",
                "@mui/icons-material",
                "@mui/icons-material/*"
              ],
              message: "G30: use <Icon> (packages/ui) — Phosphor is the only icon set."
            }
          ]
        }
      ]
    }
  },
  {
    // G-I18N (warn, lenient): nudge new user-facing copy in the web UI toward
    // the next-intl pipeline. Warn-level only — never fails CI. Scoped to the
    // web app's rendered surfaces (route tree + components); extracting every
    // existing literal is incremental, so this guides new copy without a mass
    // rewrite this wave.
    files: ["apps/web/app/**/*.tsx", "apps/web/components/**/*.tsx"],
    rules: {
      "explore-and-earn/no-untranslated-jsx-text": "warn"
    }
  }
);