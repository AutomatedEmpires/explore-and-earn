import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

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
    rules: {
      "no-console": "off",
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
  }
);