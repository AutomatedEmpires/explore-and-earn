"use client";

import {
  READINESS_TIMELINES,
  type ReadinessState,
  type Timeline,
} from "../../lib/readiness";
import styles from "./ReadinessSlider.module.css";

const TIMELINE_LABELS: Readonly<Record<Timeline, string>> = {
  now: "Ready now",
  "1_month": "In 1 month",
  "3_months": "In 3 months",
  "6_months": "In 6 months",
};

export interface ReadinessSliderProps {
  readonly value: Timeline | null;
  readonly onChange: (value: Timeline) => void;
  readonly saving?: boolean;
  readonly phase?: ReadinessState["phase"];
  readonly message?: string | null;
  readonly onDismiss?: () => void;
}

export function ReadinessSlider({
  value,
  onChange,
  saving = false,
  phase = "idle",
  message = null,
  onDismiss,
}: ReadinessSliderProps) {
  const isSaving = saving || phase === "saving";
  const currentLabel = value === null ? "Not set" : TIMELINE_LABELS[value];
  const visibleMessage = phase === "saved" || phase === "error" ? message : null;

  return (
    <section className={styles.readiness} aria-label="Availability">
      <div className={styles.control}>
        <div className={styles.head}>
          <h2 className={styles.label}>
            Availability
          </h2>
          <span className={styles.value}>{currentLabel}</span>
        </div>

        <div
          className={styles.choices}
          role="group"
          aria-label="Availability"
          aria-busy={isSaving}
        >
          {READINESS_TIMELINES.map((timeline) => {
            const selected = value === timeline;

            return (
              <button
                key={timeline}
                type="button"
                className={styles.choice}
                aria-pressed={selected}
                disabled={isSaving}
                onClick={() => {
                  if (!selected) onChange(timeline);
                }}
              >
                {TIMELINE_LABELS[timeline]}
              </button>
            );
          })}
        </div>

        {isSaving ? (
          <p className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">
            Saving…
          </p>
        ) : visibleMessage ? (
          <div
            className={`${styles.feedback} ${phase === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
            role={phase === "error" ? "alert" : "status"}
            aria-live={phase === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <span>{visibleMessage}</span>
            {onDismiss ? (
              <button
                type="button"
                className={styles.dismiss}
                onClick={onDismiss}
                aria-label="Dismiss availability message"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
