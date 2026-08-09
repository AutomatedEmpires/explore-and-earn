import {
  SEEKER_SEEKING_TIMELINES,
  type SeekerSeekingTimeline,
} from "@explore-and-earn/contracts";

export const READINESS_TIMELINES = SEEKER_SEEKING_TIMELINES;
export type Timeline = SeekerSeekingTimeline;
export type ReadinessPhase = "idle" | "saving" | "saved" | "error";

export interface ReadinessState {
  readonly committed: Timeline | null;
  readonly displayed: Timeline | null;
  readonly phase: ReadinessPhase;
  readonly message: string | null;
}

export type ReadinessAction =
  | {
      readonly type: "hydrate" | "sync";
      readonly timeline: unknown;
    }
  | {
      readonly type: "begin" | "succeeded";
      readonly timeline: Timeline;
    }
  | {
      readonly type: "failed";
      readonly message?: string;
      readonly rollbackTo?: Timeline | null;
    }
  | { readonly type: "dismiss" };

export const READINESS_SAVED_MESSAGE = "Availability saved.";
export const READINESS_FAILURE_MESSAGE =
  "We couldn't save your availability. Try again.";

const timelineSet = new Set<unknown>(READINESS_TIMELINES);

/** Return an exact persisted readiness value. Missing and malformed values stay unset. */
export function normalizeTimeline(value: unknown): Timeline | null {
  return timelineSet.has(value) ? (value as Timeline) : null;
}

export function initialReadinessState(value: unknown): ReadinessState {
  const timeline = normalizeTimeline(value);
  return {
    committed: timeline,
    displayed: timeline,
    phase: "idle",
    message: null,
  };
}

/**
 * Owns the readiness control's durable-versus-displayed state. While one save
 * is pending, new selections and server-prop hydration are ignored so a stale
 * response cannot overwrite the in-flight choice.
 */
export function readinessReducer(
  state: ReadinessState,
  action: ReadinessAction,
): ReadinessState {
  switch (action.type) {
    case "hydrate":
    case "sync": {
      if (state.phase === "saving") return state;

      const timeline = normalizeTimeline(action.timeline);
      if (
        state.committed === timeline &&
        state.displayed === timeline &&
        state.phase === "idle" &&
        state.message === null
      ) {
        return state;
      }

      return {
        committed: timeline,
        displayed: timeline,
        phase: "idle",
        message: null,
      };
    }

    case "begin": {
      if (state.phase === "saving") return state;
      const timeline = normalizeTimeline(action.timeline);
      if (timeline === null) return state;

      return {
        ...state,
        displayed: timeline,
        phase: "saving",
        message: null,
      };
    }

    case "succeeded": {
      if (state.phase !== "saving") return state;
      const timeline = normalizeTimeline(action.timeline);
      if (timeline === null) return state;

      return {
        committed: timeline,
        displayed: timeline,
        phase: "saved",
        message: READINESS_SAVED_MESSAGE,
      };
    }

    case "failed": {
      if (state.phase !== "saving") return state;
      const committed =
        action.rollbackTo === undefined ? state.committed : action.rollbackTo;
      return {
        committed,
        displayed: committed,
        phase: "error",
        message: action.message || READINESS_FAILURE_MESSAGE,
      };
    }

    case "dismiss":
      if (state.phase === "saving") return state;
      if (state.phase === "idle" && state.message === null) return state;
      return {
        ...state,
        phase: "idle",
        message: null,
      };
  }
}
