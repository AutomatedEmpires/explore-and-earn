import { ProseSection } from "./ProseSection";

export interface WhyWorkForUsProps {
  /** Host narrative pitch (host_profiles.narrative.whyWorkForUs); null when absent. */
  readonly text: string | null;
}

/**
 * "About the company" — the host's recruiting pitch from their narrative. A thin
 * wrapper over ProseSection that renders nothing when the host hasn't written one.
 */
export function WhyWorkForUs({ text }: WhyWorkForUsProps) {
  if (!text) return null;

  return (
    <ProseSection
      title="About the company"
      icon="trust.founding_host"
      headingId="listing-company"
      text={text}
    />
  );
}
