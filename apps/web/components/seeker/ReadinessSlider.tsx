"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";

import styles from "./ReadinessSlider.module.css";

export interface ReadinessSliderProps {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
  readonly saving?: boolean;
}

interface ReadinessStop {
  readonly value: string;
  readonly label: string;
  readonly short: string;
}

/** Four discrete availability stops. Values match saveReadinessAction's
 *  VALID_TIMELINES ("now" · "1_month" · "3_months" · "6_months"). */
const STOPS: readonly ReadinessStop[] = [
  { value: "now",      label: "Ready now",   short: "Now" },
  { value: "1_month",  label: "In 1 month",  short: "1mo" },
  { value: "3_months", label: "In 3 months", short: "3mo" },
  { value: "6_months", label: "In 6 months", short: "6mo" },
];

const TOAST_MS = 3000;

export function ReadinessSlider({ value, onChange, saving = false }: ReadinessSliderProps) {
  const found = STOPS.findIndex((s) => s.value === (value ?? "now"));
  const index = found === -1 ? 0 : found;
  const active = STOPS[index];

  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending auto-dismiss on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = STOPS[Number(event.target.value)] ?? STOPS[0];
      if (next.value === (value ?? "now")) return;
      onChange(next.value);
      setToast("Updated — this affects your match score.");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), TOAST_MS);
    },
    [onChange, value],
  );

  // 0 → 100% fill across the four stops; consumed by the track paint in CSS.
  const fill = (index / (STOPS.length - 1)) * 100;

  return (
    <div className={styles.readiness}>
      <div className={styles.slider}>
        <div className={styles.head}>
          <span className={styles.label}>Availability</span>
          <span className={styles.value}>{active.label}</span>
          {saving && (
            <span className={styles.saving} aria-live="polite" aria-atomic="true">
              Saving…
            </span>
          )}
        </div>

        <div className={styles.control}>
          <input
            type="range"
            className={styles.range}
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={index}
            onChange={handleInput}
            aria-label="Availability"
            aria-valuetext={active.label}
            style={{ "--fill": `${fill}%` } as CSSProperties}
          />
          <div className={styles.ticks} aria-hidden="true">
            {STOPS.map((stop, i) => (
              <span
                key={stop.value}
                className={`${styles.tick} ${i === index ? styles.tickActive : ""}`}
              >
                {stop.short}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Non-blocking, auto-dismissing notice (house toast pattern). */}
      {toast && (
        <div className={styles.toastStack} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.toast}>
            <span className={styles.toastDot} aria-hidden="true" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}