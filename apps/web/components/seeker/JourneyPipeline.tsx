
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
  readonly acceptedCount: number;
  readonly acceptedUpcoming?: string;
}

export function JourneyPipeline({
  matchedCount,
  savedCount,
  appliedCount,
  offersCount,
  acceptedCount,
  acceptedUpcoming,
}: JourneyPipelineProps) {
  const steps: PipelineStep[] = [
    { href: "/seek",     label: "Matched", count: matchedCount,  hasActivity: matchedCount > 0  },
    { href: "/saved",    label: "Saved",   count: savedCount,    hasActivity: savedCount > 0    },
    { href: "/applied",  label: "Applied", count: appliedCount,  hasActivity: appliedCount > 0  },
    { href: "/offered",  label: "Offers",  count: offersCount,   hasActivity: offersCount > 0,  isUrgent: offersCount > 0 },
    { href: "/accepted", label: "Accepted", count: acceptedCount, hasActivity: acceptedCount > 0 || Boolean(acceptedUpcoming) },
  ];

  const reachedIdx = steps.reduce((max, s, i) => (s.hasActivity ? i : max), -1);

  // "You are here / do this next" — the most urgent open step wins, otherwise
  // the furthest step that already has activity. This is the only promoted dot.
  const urgentIdx = steps.findIndex((s) => s.isUrgent);
  const currentIdx = urgentIdx >= 0 ? urgentIdx : reachedIdx;

  return (
    <nav className={styles.pipeline} aria-label="Application journey">
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx;
        return (
          <div key={step.href} className={styles.unit}>
            {i > 0 && (
              <div
                className={`${styles.connector} ${i <= reachedIdx ? styles.connectorFilled : ""}`}
                aria-hidden="true"
              />
            )}
            <Link
              href={step.href}
              className={[
                styles.step,
                step.hasActivity ? styles.stepActive : "",
                step.isUrgent ? styles.stepUrgent : "",
                isCurrent ? styles.stepCurrent : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={step.count != null ? `${step.label}: ${step.count}` : step.label}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className={styles.dot}>
                {step.count != null && step.count > 0 ? (
                  <span className={styles.dotCount}>{step.count > 99 ? "99+" : step.count}</span>
                ) : step.hasActivity ? (
                  <span className={styles.dotCheck} aria-hidden="true" />
                ) : (
                  <span className={styles.dotEmpty} aria-hidden="true" />
                )}
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
