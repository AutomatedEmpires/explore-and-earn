import { Meter } from "@explore-and-earn/ui";
import {
  MATCH_BANDS,
  matchReasonPhrase,
  type MatchBand,
  type MatchCap,
  type MatchResult,
} from "@explore-and-earn/contracts";

import styles from "./SeekerFitSignal.module.css";

/**
 * Seeker-facing fit signal on the listing detail page — the payoff of the
 * ADR-040 engine at the moment a seeker decides to apply. Honest and grounded:
 * the band + score come straight from the engine; reasons are derived at render
 * time from the numeric components (G34, never stored); caps become plain-spoken
 * caveats. Presentational only — no client JS, no data fetching.
 */

const BAND_SUBLINE: Record<MatchBand, string> = {
  strong: "This lines up well with what you're looking for.",
  developing: "Some things line up — worth a closer look.",
  needs_attention: "This one's a stretch based on your preferences.",
};

/** Plain-spoken, honest translations of the hard caps (ceilings) that fired. */
const CAP_CAVEATS: Record<MatchCap, string> = {
  requiredCertificationMissing: "A required certification may be missing from your profile.",
  impossibleTimelineConflict: "The dates may not line up with your availability.",
  housingRequiredButNotIncluded: "Housing isn't included, and you prefer it provided.",
  visaSupportRequiredButUnavailable: "Visa support may not be available for this role.",
};

export interface SeekerFitSignalProps {
  readonly result: MatchResult;
}

export function SeekerFitSignal({ result }: SeekerFitSignalProps) {
  // An excluded pairing is never a meaningful "fit" — show nothing rather than
  // a misleading zero.
  if (result.excluded) return null;

  const band =
    MATCH_BANDS.find((entry) => entry.id === result.band) ??
    MATCH_BANDS[MATCH_BANDS.length - 1];
  const subline = matchReasonPhrase(result.components) ?? BAND_SUBLINE[result.band];

  return (
    <section
      className={styles.panel}
      data-band={result.band}
      aria-label="Your fit for this opportunity"
    >
      <div className={styles.head}>
        <span className={styles.eyebrow}>Your fit</span>
        <Meter value={result.score} label="MATCH" />
      </div>
      <p className={styles.band}>{band.label}</p>
      <p className={styles.subline}>{subline}</p>
      {result.capsApplied.length > 0 && (
        <ul className={styles.caveats}>
          {result.capsApplied.map((cap) => (
            <li key={cap} className={styles.caveat}>
              {CAP_CAVEATS[cap]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
