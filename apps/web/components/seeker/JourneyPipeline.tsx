"use client";

import Link from "next/link";
import styles from "./JourneyPipeline.module.css";

interface PipelineStep {
  readonly href: string;
  readonly label: string;
  readonly count?: number;
  readonly hasActivity: boolean;
  readonly isUrgent?: boolean;
}

export interface JourneyPipelineProps {
  readonly matchedCount: number;
  readonly savedCount: number;
  readonly appliedCount: number;
  readonly offersCount: number;
  readonly acceptedUpcoming?: string;
}

export function JourneyPipeline({
  matchedCount,
  savedCount,
  appliedCount,
  offersCount,
  acceptedUpcoming,
}: JourneyPipelineProps) {
  const steps: PipelineStep[] = [
    { href: "/seek",     label: "Matched", count: matchedCount,  hasActivity: matchedCount > 0  },
    { href: "/saved",    label: "Saved",   count: savedCount,    hasActivity: savedCount > 0    },
    { href: "/applied",  label: "Applied", count: appliedCount,  hasActivity: appliedCount > 0  },
    { href: "/offered",  label: "Offers",  count: offersCount,   hasActivity: offersCount > 0,  isUrgent: offersCount > 0 },
    { href: "/accepted", label: "Accepted",                      hasActivity: Boolean(acceptedUpcoming) },
  ];

  const reachedIdx = steps.reduce((max, s, i) => (s.hasActivity ? i : max), -1);

  return (
    <nav className={styles.pipeline} aria-label="Application journey">
      {steps.map((step, i) => (
        <div key={step.href} className={styles.unit}>
          {i > 0 && (
            <div
              className={`${styles.connector} ${i <= reachedIdx ? styles.connectorFilled : ""}`}
              aria-hidden="true"
            />
          )}
          <Link
            href={step.href}
            className={`${styles.step} ${step.hasActivity ? styles.stepActive : ""} ${step.isUrgent ? styles.stepUrgent : ""}`}
            aria-label={step.count != null ? `${step.label}: ${step.count}` : step.label}
          >
            <div className={styles.dot}>
              {step.count != null && step.count > 0 ? (
                <span className={styles.dotCount}>{step.count > 99 ? "99+" : step.count}</span>
              ) : step.hasActivity ? (
                <span className={styles.dotCheck} aria-hidden="true" />
              ) : (
                <span className={styles.dotEmpty} aria-hidden="true" />
              )}
            </div>
            <span className={styles.stepLabel}>{step.label}</span>
          </Link>
        </div>
      ))}
    </nav>
  );
}
