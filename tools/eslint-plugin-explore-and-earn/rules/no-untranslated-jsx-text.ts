// G-I18N (warn, lenient): nudge NEW user-facing JSX copy toward the i18n
// pipeline instead of hardcoded English literals.
//
// The internationalization foundation (next-intl) routes display copy through
// messages/<locale>.json + useTranslations / getTranslations. Extracting all
// ~290 components is incremental, so this rule is deliberately LENIENT and
// wired at "warn" — it never fails CI. It flags only multi-word JSXText (real
// sentences / labels), leaving single words, numbers, punctuation, and icon
// glyphs alone. Wrap flagged copy with a translation key when you touch the
// file; silence a deliberate literal with an eslint-disable-next-line comment.
export default {
  meta: {
    name: "no-untranslated-jsx-text",
    type: "suggestion",
    docs: {
      description:
        "Warn on new hardcoded multi-word JSX text; prefer useTranslations/getTranslations + messages/<locale>.json.",
    },
    schema: [],
    messages: {
      untranslated:
        "G-I18N: hardcoded UI copy “{{sample}}” — route it through useTranslations/getTranslations (messages/<locale>.json) as locales are extracted.",
    },
  },
  create(context) {
    return {
      JSXText(node) {
        const collapsed = String(node.value).replace(/\s+/g, " ").trim();
        if (!collapsed) return;
        // Drop HTML entities (&amp; &rsquo; …) before judging meaningfulness.
        const stripped = collapsed.replace(/&[a-zA-Z]+;/g, " ").trim();
        if (!/[A-Za-z]/.test(stripped)) return;
        // Lenient: only flag phrases of 2+ real words (>=2 letters each). Single
        // words, glyphs, and numeric/punctuation-only text are intentionally
        // ignored to keep the signal actionable.
        const words = stripped.match(/[A-Za-z]{2,}/g) ?? [];
        if (words.length < 2) return;
        const sample =
          collapsed.length > 32 ? `${collapsed.slice(0, 32)}…` : collapsed;
        context.report({ node, messageId: "untranslated", data: { sample } });
      },
    };
  },
};
