import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import {
  topMatchReasons,
  type MatchResult,
  type MatchScoreComponent,
} from "@explore-and-earn/contracts";

import { ListingSection } from "./ListingSection";
import { SeekerFitSignal } from "./SeekerFitSignal";
import styles from "./FitReasons.module.css";

/**
 * Reassuring, plain-spoken lead-in per scoring component — derived at render
 * time from the numeric fit result (never stored; G34). Only components whose
 * sub-score clears the topMatchReasons threshold are surfaced, so every line here
 * is an honest strength.
 */
const REASON_COPY: Record<MatchScoreComponent, string> = {
  categoryRoleFit: "This is the kind of work you're looking for.",
  locationTravelFit: "The location works for where you want to go.",
  availabilityOverlap: "The timing lines up with when you're free.",
  payAlignment: "The pay is in the range you're after.",
  housingMealsFit: "What's covered matches what you need provided.",
  profileCompleteness: "Your profile gives us a lot to match on.",
};

const REASON_ICON = "system.success" as const;

export interface FitReasonsPrompt {
  readonly text: string;
  readonly href: string;
}

export interface FitReasonsProps {
  /** The seeker's fit result, or null when it can't be computed honestly. */
  readonly fit: MatchResult | null;
  /** Gentle CTA for viewers without a fit (guest / thin profile). */
  readonly prompt: FitReasonsPrompt | null;
}

/**
 * "Why you're a good fit" — features the ADR-040 SeekerFitSignal, then spells out
 * the specific strengths behind the band in reassuring language. Viewers who
 * can't get an honest score (guests, or seekers with too-thin profiles) see a
 * gentle prompt instead. Renders nothing when there is neither a fit nor a
 * prompt (e.g. the owner previewing their own listing).
 */
export function FitReasons({ fit, prompt }: FitReasonsProps) {
  if (!fit && !prompt) return null;

  const reasons = fit && !fit.excluded ? topMatchReasons(fit.components, 3) : [];

  return (
    <ListingSection
      title="Why you're a good fit"
      icon="status.match"
      headingId="listing-fit"
    >
      {fit ? <SeekerFitSignal result={fit} /> : null}

      {reasons.length > 0 ? (
        <ul className={styles.reasons}>
          {reasons.map((reason) => (
            <li key={reason.component} className={styles.reason}>
              <Icon name={REASON_ICON} size={18} aria-hidden />
              <span>{REASON_COPY[reason.component]}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!fit && prompt ? (
        <Link href={prompt.href} className={styles.prompt}>
          <Icon name="status.match" size={20} aria-hidden />
          <span>{prompt.text}</span>
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </ListingSection>
  );
}
