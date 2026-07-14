"use client";

import { useEffect, useState } from "react";

import styles from "./AppearanceControl.module.css";

/**
 * Appearance (theme) control for seeker Settings.
 *
 * The no-flash bootstrap in app/layout.tsx (THEME_INIT_SCRIPT) reads the
 * "ee-theme" localStorage key before first paint but nothing writes it — this
 * control is the writer. It persists an EXPLICIT preference of
 * "auto" | "dark" | "light" and applies the same resolution live:
 *   • "dark" / "light" — committed verbatim.
 *   • "auto"           — resolved by local clock (dark 20:00–06:00, matching the
 *                        bootstrap + Sweepza) then the OS prefers-color-scheme.
 *
 * The theme lives ONLY in <html data-theme> + colorScheme (tokens.css keys off
 * it), so applying is a two-line DOM write — no reload, no flash.
 */

type ThemePref = "auto" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "ee-theme";

const OPTIONS: readonly { readonly value: ThemePref; readonly label: string; readonly hint: string }[] = [
  { value: "light", label: "Light", hint: "Always the day palette" },
  { value: "dark", label: "Dark", hint: "Always the night palette" },
  { value: "auto", label: "Auto", hint: "Follows the clock & your device" },
];

/** Clock (dark 20:00–06:00) then OS fallback — mirrors THEME_INIT_SCRIPT. */
function resolveAuto(): ResolvedTheme {
  const hour = new Date().getHours();
  const night = hour >= 20 || hour < 6;
  const osDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return night || osDark ? "dark" : "light";
}

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "auto") {
      return raw;
    }
  } catch {
    /* localStorage may be unavailable (private mode) — fall through to auto. */
  }
  return "auto";
}

function applyTheme(pref: ThemePref): void {
  const resolved: ResolvedTheme = pref === "auto" ? resolveAuto() : pref;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function AppearanceControl() {
  // Default to "auto" for SSR + first client render (matches the bootstrap's
  // default), then reconcile to the stored value after mount to avoid a
  // hydration mismatch.
  const [pref, setPref] = useState<ThemePref>("auto");

  useEffect(() => {
    setPref(readStored());
  }, []);

  const choose = (next: ThemePref) => {
    setPref(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Persist is best-effort; still apply for this session. */
    }
    applyTheme(next);
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
