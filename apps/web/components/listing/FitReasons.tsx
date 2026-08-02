import Link from "next/link";

import { Icon, type IconKey } from "@explore-and-earn/ui";
import {
  matchBandFor,
  matchBandLabel,
  renderMatchSignal,
  type MatchSignal,
  type MatchTrace,
} from "@explore-and-earn/contracts";

import {
  fitCoverageSentence,
  groupFitSignals,
  type FitGroups,
} from "../../lib/fitGroups";
import { ListingSection } from "./ListingSection";
import styles from "./FitReasons.module.css";

/**
 * "How this lines up for you" — the seeker↔listing fit.
 *
 * This replaces a display that was quietly fabricating. The old version ran
 * topMatchReasons() over the raw component scores, but several components fall
 * back to an "unknown" sentinel (~65) when the seeker never stated anything —
 * and those sentinels clear the reason threshold. So a seeker who had given us
 * nothing was told, in confident prose, "The timing lines up with when you're
 * free." and "The pay is in the range you're after."
 *
 * The trace already distinguishes the two: buildMatchTrace tags every
 * sentinel-derived signal with polarity "missing". Grouping by polarity is what
 * makes the section honest — a thing we could not compute is reported as
 * something we could not compute, with a link to fix it, and can never be
 * dressed up as a reason.
 *
 * Presentation notes (founder ruling 2026-07-24 left the form to us):
 *  - The meter has exactly THREE steps because there are exactly three bands.
 *    A percentage would imply a resolution the engine does not have, and half
 *    its inputs are missing on this surface anyway.
 *  - The band is carried by the WORD first; the icon shape differs per band and
 *    the colour is decoration. Nothing here is colour-only.
 */

/** Filled steps per band — one step per band, so the meter never over-claims. */
const BAND_STEPS: Record<string, number> = {
  strong: 3,
  developing: 2,
  needs_attention: 1,
};

/** Shape differs per band so the meaning survives greyscale and forced colors. */
const BAND_ICON: Record<string, IconKey> = {
  strong: "system.success",
  developing: "status.match",
  needs_attention: "system.info",
};

/**
 * Display order is the honesty order: hard blockers before any praise, and the
 * things we could not compute LAST and clearly separated — never mixed into the
 * evidence.
 */
const GROUPS: ReadonlyArray<{
  readonly title: string;
  readonly pick: (g: FitGroups) => readonly MatchSignal[];
  readonly icon: IconKey;
  readonly tone: string;
  readonly fixable?: boolean;
}> = [
  {
    title: "Before you go further",
    pick: (g) => g.blockers,
    icon: "system.warning",
    tone: styles.toneBlocker,
  },
  {
    title: "Lines up",
    pick: (g) => g.positives,
    icon: "system.success",
    tone: styles.tonePositive,
  },
  {
    title: "Worth checking first",
    pick: (g) => g.watch,
    icon: "system.warning",
    tone: styles.toneNegative,
  },
  {
    title: "Can't tell yet",
    pick: (g) => g.missing,
    icon: "system.info",
    tone: styles.toneMissing,
    fixable: true,
  },
];

export interface FitReasonsPrompt {
  readonly text: string;
  /**
   * Omitted when there is nothing for the seeker to DO. "We haven't scored this
   * yet" is a statement about us, not a task for them, and rendering it as a
   * call to action would invite a click that fixes nothing.
   */
  readonly href?: string | null;
}

export interface FitReasonsProps {
  /** The seeker's fit trace, or null when it can't be computed honestly. */
  readonly trace: MatchTrace | null;
  /** Gentle CTA for viewers without a fit (guest / thin profile). */
  readonly prompt: FitReasonsPrompt | null;
  /** Used to send "can't tell yet" fixes back here once the profile is filled. */
  readonly listingId: string;
}

function signalKey(signal: MatchSignal): string {
  return `${signal.code}:${signal.component ?? "cap"}`;
}

export function FitReasons({ trace, prompt, listingId }: FitReasonsProps) {
  if (!trace && !prompt) return null;

  // Grouping is the honesty rule and lives in lib/fitGroups, so it is testable
  // on its own — a "missing" signal must never surface as evidence.
  const groups = trace ? groupFitSignals(trace) : null;
  const resumeHref = `/resume?redirect_url=${encodeURIComponent(`/listing/${listingId}`)}`;
  const showBand = Boolean(trace) && !trace?.excluded && !groups?.tooThin;
  const band = trace ? matchBandFor(trace.score) : null;

  return (
    <ListingSection
      title="How this lines up for you"
      icon="status.match"
      headingId="listing-fit"
    >
      {showBand && band ? (
        <div className={styles.verdict}>
          <span className={`${styles.bandChip} ${styles[`band_${band}`] ?? ""}`}>
            <Icon name={BAND_ICON[band] ?? "status.match"} size={18} aria-hidden />
            {matchBandLabel(band)}
          </span>
          {/* The value is in the chip text above; the steps are decoration, so
              they are hidden from assistive tech rather than re-announced. */}
          <span className={styles.steps} aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`${styles.step} ${
                  i < (BAND_STEPS[band] ?? 0) ? styles.stepOn : ""
                }`}
              />
            ))}
          </span>
        </div>
      ) : null}

      {trace?.excluded ? (
        <p className={styles.note}>This one isn&apos;t open to you.</p>
      ) : null}

      {groups?.tooThin && !trace?.excluded ? (
        <p className={styles.note}>
          There isn&apos;t enough on your profile yet to say how this fits.
        </p>
      ) : null}

      {showBand && groups ? (
        <p className={styles.coverage}>{fitCoverageSentence(groups)}</p>
      ) : null}

      {groups
        ? GROUPS.map((group) => {
            const rows = group.pick(groups);
            if (rows.length === 0) return null;
            return (
              <div className={styles.group} key={group.title}>
                <h3 className={styles.groupTitle}>{group.title}</h3>
                <ul className={styles.rows}>
                  {rows.map((signal) => (
                    <li className={styles.row} key={signalKey(signal)}>
                      <Icon
                        name={group.icon}
                        size={18}
                        aria-hidden
                        className={group.tone}
                      />
                      <span>{renderMatchSignal(signal, "seeker")}</span>
                    </li>
                  ))}
                </ul>
                {group.fixable ? (
                  <Link className={styles.fixLink} href={resumeHref}>
                    Add this to your profile
                    <Icon name="action.forward" size={16} aria-hidden />
                  </Link>
                ) : null}
              </div>
            );
          })
        : null}

      {!trace && prompt ? (
        prompt.href ? (
          <Link href={prompt.href} className={styles.prompt}>
            <Icon name="status.match" size={20} aria-hidden />
            <span>{prompt.text}</span>
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        ) : (
          // No href: a status, not a CTA. No forward chevron, because there is
          // nowhere to go and nothing the seeker can do about it.
          <p className={styles.prompt}>
            <Icon name="status.match" size={20} aria-hidden />
            <span>{prompt.text}</span>
          </p>
        )
      ) : null}
    </ListingSection>
  );
}
