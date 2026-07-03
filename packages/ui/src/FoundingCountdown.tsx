import { FOUNDING_SEAT_CAP } from "@explore-and-earn/contracts";

export interface FoundingCountdownProps {
  /**
   * How many Founding Host seats have been claimed so far. Required — this
   * component never fabricates a number; the caller must supply a real count
   * (or omit rendering it entirely rather than pass a guess).
   */
  readonly seatsClaimed: number;
  /** Total seats in the program. Defaults to the founder-locked cap. */
  readonly seatCap?: number;
}

/**
 * Founding Host Program seat counter — a real, data-driven badge, not a
 * decorative placeholder. Callers own sourcing `seatsClaimed` (e.g. a count
 * query against founding-host subscriptions); this component only formats
 * and presents it, matching the "never fabricate a number" convention the
 * rest of the product follows (see MatchCardRail's honest reason chips).
 */
export function FoundingCountdown({
  seatsClaimed,
  seatCap = FOUNDING_SEAT_CAP,
}: FoundingCountdownProps) {
  const remaining = Math.max(0, seatCap - seatsClaimed);
  const soldOut = remaining <= 0;

  return (
    <span className={soldOut ? "ui-countdown ui-countdown--soldout" : "ui-countdown"}>
      <span className="ui-countdown__label">Founding Host Program</span>
      <span className="ui-countdown__value">
        {soldOut
          ? "All founding seats claimed"
          : `${remaining} of ${seatCap} founding seats left`}
      </span>
    </span>
  );
}
