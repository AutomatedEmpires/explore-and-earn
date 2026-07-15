"use client";

import { useEffect, useState } from "react";

import styles from "./PaletteControl.module.css";

/**
 * Accent palette control for seeker Settings.
 *
 * A cosmetic, opt-in accent reskin on the `data-palette` axis (see
 * styles/palettes.css), orthogonal to the light/dark Appearance control.
 * "Glacier" is the locked default — selecting it REMOVES the attribute so
 * tokens.css wins. The no-flash bootstrap in app/layout.tsx reads the same
 * "ee-palette" key before first paint; this control is its live writer.
 */

type PaletteId = "glacier" | "sunset" | "meadow" | "orchid" | "ember";

const STORAGE_KEY = "ee-palette";

interface Palette {
  readonly id: PaletteId;
  readonly label: string;
  /** Preview gradient (mirrors the light seeds in palettes.css). */
  readonly swatch: string;
}

const PALETTES: readonly Palette[] = [
  { id: "glacier", label: "Glacier", swatch: "linear-gradient(135deg, #1E6A9E, #0E9488)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg, #C4461F, #E8843A)" },
  { id: "meadow", label: "Meadow", swatch: "linear-gradient(135deg, #15774A, #3E9E63)" },
  { id: "orchid", label: "Orchid", swatch: "linear-gradient(135deg, #7B3FC9, #B84FA8)" },
  { id: "ember", label: "Ember", swatch: "linear-gradient(135deg, #C62433, #E85E38)" },
];

function readStored(): PaletteId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && PALETTES.some((p) => p.id === raw)) {
      return raw as PaletteId;
    }
  } catch {
    /* localStorage may be unavailable (private mode) — fall through to default. */
  }
  return "glacier";
}

function applyPalette(id: PaletteId): void {
  const root = document.documentElement;
  if (id === "glacier") {
    root.removeAttribute("data-palette");
  } else {
    root.dataset.palette = id;
  }
}

export function PaletteControl() {
  // "glacier" for SSR + first render (the default), then reconcile after mount.
  const [pal, setPal] = useState<PaletteId>("glacier");

  useEffect(() => {
    setPal(readStored());
  }, []);

  const choose = (next: PaletteId) => {
    setPal(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Persist is best-effort; still apply for this session. */
    }
    applyPalette(next);
  };

  return (
    <div className={styles.group} role="radiogroup" aria-label="Accent palette">
      {PALETTES.map((palette) => {
        const selected = pal === palette.id;
        return (
          <button
            key={palette.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={styles.option}
            data-selected={selected ? "true" : undefined}
            onClick={() => choose(palette.id)}
          >
            <span
              className={styles.swatch}
              style={{ background: palette.swatch }}
              aria-hidden="true"
            />
            <span className={styles.label}>{palette.label}</span>
          </button>
        );
      })}
    </div>
  );
}
