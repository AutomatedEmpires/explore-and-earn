"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_THEME_PREF,
  applyThemePref,
  persistThemePref,
  readStoredThemePref,
  type ThemePref,
} from "../../lib/theme";
import styles from "./AppearanceControl.module.css";

/**
 * Appearance (theme) control for seeker Settings.
 *
 * All storage/resolution rules live in lib/theme.ts (the contract) — this is
 * the Settings-page writer, sibling to the header ThemeSwitcher. It persists an
 * EXPLICIT preference of "light" | "dark" | "system" to BOTH stores
 * (localStorage + the SSR cookie) and applies it live:
 *   • "light" / "dark" — committed verbatim.
 *   • "system"         — follows the OS prefers-color-scheme (the retired
 *                        legacy "auto" value normalizes to "system").
 *
 * DEFAULT ENTRY is LIGHT (founder 2026-07-22); Dark/System are opt-in. The
 * theme lives ONLY in <html data-theme> + colorScheme (tokens.css keys off
 * it), so applying is a two-line DOM write — no reload, no flash.
 */

const OPTIONS: readonly { readonly value: ThemePref; readonly label: string; readonly hint: string }[] = [
  { value: "light", label: "Light", hint: "Always the day palette" },
  { value: "dark", label: "Dark", hint: "Always the night palette" },
  { value: "system", label: "System", hint: "Follows your device" },
];

export function AppearanceControl() {
  // Default to "light" for SSR + first client render (matches the bootstrap's
  // unstored default), then reconcile to the stored value after mount to avoid
  // a hydration mismatch.
  const [pref, setPref] = useState<ThemePref>(DEFAULT_THEME_PREF);

  useEffect(() => {
    setPref(readStoredThemePref() ?? DEFAULT_THEME_PREF);
  }, []);

  const choose = (next: ThemePref) => {
    setPref(next);
    persistThemePref(next);
    applyThemePref(next);
  };

  return (
    <div
      className={styles.group}
      role="radiogroup"
      aria-label="Appearance"
    >
      {OPTIONS.map((option) => {
        const selected = pref === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={styles.option}
            data-selected={selected ? "true" : undefined}
            onClick={() => choose(option.value)}
          >
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.optionHint}>{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
