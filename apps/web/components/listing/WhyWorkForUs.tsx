import { ProseSection } from "./ProseSection";

export interface WhyWorkForUsProps {
  /** Host narrative pitch (host_profiles.narrative.whyWorkForUs); null when absent. */
  readonly text: string | null;
}

/**
 * "Why work with us" — the host's recruiting pitch from their narrative. A thin
 * wrapper over ProseSection that renders nothing when the host hasn't written one.
 */
export function WhyWorkForUs({ text }: WhyWorkForUsProps) {
  if (!text) return null;

  return (
    <ProseSection
      title="Why work with us"
      icon="trust.founding_host"
      headingId="listing-why"
      text={text}
    />
  );
}
