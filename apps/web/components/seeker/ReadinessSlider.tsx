"use client";

import styles from "./ReadinessSlider.module.css";

export interface ReadinessSliderProps {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly saving?: boolean;
}

interface ReadinessOption {
  readonly value: string;
  readonly label: string;
  readonly short: string;
  readonly colorClass: "now" | "soon" | "later";
}

const OPTIONS: readonly ReadinessOption[] = [
  { value: "now",      label: "Ready Now", short: "Now", colorClass: "now"   },
  { value: "1_month",  label: "1 Month",   short: "1mo", colorClass: "soon"  },
  { value: "3_months", label: "3 Months",  short: "3mo", colorClass: "later" },
  { value: "6_months", label: "6 Months",  short: "6mo", colorClass: "later" },
];

export function ReadinessSlider({ value, onChange, saving = false }: ReadinessSliderProps) {
  const active = value ?? "now";

  return (
    <div className={styles.strip} role="group" aria-label="Availability timeline">
      <span className={styles.label} aria-hidden="true">Available</span>
      <div className={styles.pills}>
        {OPTIONS.map((opt) => {
          const isActive = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={saving}
              onClick={() => onChange(opt.value)}
              className={`${styles.pill} ${styles[opt.colorClass]} ${isActive ? styles.pillActive : ""}`}
            >
              {/* Pulsing dot for "Ready Now" only */}
              {opt.value === "now" && isActive && (
                <span className={styles.nowDot} aria-hidden="true" />
              )}
              <span className={styles.short} aria-hidden="true">{opt.short}</span>
              <span className={styles.full}>{opt.label}</span>
            </button>
          );
        })}
      </div>
      {saving && (
        <span className={styles.saving} aria-live="polite" aria-atomic="true">
          Saving…
        </span>
      )}
    </div>
  );
}
