import type { CSSProperties } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import styles from "./HostSetupChecklist.module.css";

interface SetupStep {
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  readonly cta: string;
  readonly done: boolean;
}

export interface HostSetupChecklistProps {
  /** Host profile exists (a company/farm name is set). */
  readonly hasProfile: boolean;
  /** Total listings the host has created (any status). */
  readonly listingCount: number;
  /** Listings currently live in discovery. */
  readonly liveCount: number;
}

/**
 * First-run guided path for a new host — the numbered "get your first
 * opportunity live" checklist. Every step is derived from real dashboard signals
 * (no fabrication); the first incomplete step is promoted with the primary CTA
 * so a novice always has an obvious next action. Shown on the dashboard until the
 * host has a live listing, then it retires itself.
 */
export function HostSetupChecklist({
  hasProfile,
  listingCount,
  liveCount,
}: HostSetupChecklistProps) {
  const steps: readonly SetupStep[] = [
    {
      label: "Set up your host profile",
      hint: "Your public page — who seekers see they're applying to.",
      href: "/host/profile/edit",
      cta: "Edit profile",
      done: hasProfile,
    },
    {
      label: "Post your first opportunity",
      hint: "Add the role with Housing, Meals & Pay up front.",
      href: "/host/listings/new",
      cta: "Create listing",
      done: listingCount > 0,
    },
    {
      label: "Add photos & publish",
      hint: "Framed photos, then submit for review to go live.",
      href: listingCount > 0 ? "/host/listings" : "/host/listings/new",
      cta: listingCount > 0 ? "Finish & publish" : "Create listing",
      done: liveCount > 0,
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextIndex = steps.findIndex((step) => !step.done);

  return (
    <section
      className={`host-panel host-panel--raised ${styles.card}`}
      aria-labelledby="host-setup-heading"
    >
      <div className="host-panel__head">
        <div className="host-panel__titles">
          <span className="host-panel__eyebrow">Getting started</span>
          <h2 id="host-setup-heading" className="host-panel__title">
            Get your first opportunity live
          </h2>
        </div>
        <span
          className={styles.progress}
          aria-label={`${doneCount} of ${steps.length} steps complete`}
        >
          <span
            className={styles.progressTrack}
            style={{ "--pct": `${pct}%` } as CSSProperties}
            aria-hidden
          >
            <span />
          </span>
          <span className={styles.progressText}>
            {doneCount}/{steps.length}
          </span>
        </span>
      </div>

      <ol className={styles.steps}>
        {steps.map((step, i) => {
          const isNext = i === nextIndex;
          const cls = [
            styles.step,
            step.done ? styles.stepDone : "",
            isNext ? styles.stepNext : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={step.label} className={cls}>
              <span className={styles.stepMark} aria-hidden>
                {step.done ? (
                  <Icon name="system.success" size={20} />
                ) : (
                  <span className={styles.stepNum}>{i + 1}</span>
                )}
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepLabel}>{step.label}</span>
                <span className={styles.stepHint}>{step.hint}</span>
              </span>
              {step.done ? (
                <span className={styles.stepDoneTag}>Done</span>
              ) : (
                <Link
                  className={isNext ? styles.stepCtaPrimary : styles.stepCta}
                  href={step.href}
                >
                  {step.cta}
                  <Icon name="action.forward" size={16} aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <p className={styles.footer}>
        Then keep momentum:{" "}
        <Link className={styles.footerLink} href="/host/listings">
          boost a listing
        </Link>{" "}
        for visibility, or{" "}
        <Link className={styles.footerLink} href="/host/announcements">
          post an announcement
        </Link>{" "}
        to reach seekers.
      </p>
    </section>
  );
}
