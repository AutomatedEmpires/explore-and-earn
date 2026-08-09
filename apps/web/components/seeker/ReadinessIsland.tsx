"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  saveReadinessAction,
  type SaveReadinessResult,
} from "../../app/actions/seekerProfile";
import {
  initialReadinessState,
  normalizeTimeline,
  readinessReducer,
  type Timeline,
} from "../../lib/readiness";
import { ReadinessSlider } from "./ReadinessSlider";

type SaveReadinessError = Extract<
  SaveReadinessResult,
  { readonly ok: false }
>["error"];

function errorMessage(error: SaveReadinessError): string {
  if (error === "unauthenticated") {
    return "Sign in again to update your availability.";
  }
  if (error === "invalid_timeline") {
    return "Choose one of the available timelines.";
  }
  return "We couldn't save your availability. Try again.";
}

/**
 * The one client island on the seeker dashboard: the availability window
 * control, with a single in-flight save and an explicit rollback on failure.
 * Everything around it renders on the server so every time-derived string is
 * computed exactly once per request.
 */
export function ReadinessIsland({
  initialValue,
}: {
  readonly initialValue: string | null;
}) {
  const [state, dispatch] = useReducer(
    readinessReducer,
    initialValue,
    initialReadinessState,
  );
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const synchronizedPropRef = useRef(normalizeTimeline(initialValue));
  const deferredPropRef = useRef<{
    seen: boolean;
    timeline: Timeline | null;
  }>({ seen: false, timeline: null });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timeline = normalizeTimeline(initialValue);
    if (timeline === synchronizedPropRef.current) return;

    // Record every prop version even while a request is in flight. Otherwise a
    // stale RSC payload observed during the save can look "new" after success
    // and overwrite the timeline that the action just confirmed.
    synchronizedPropRef.current = timeline;
    if (inFlightRef.current) {
      deferredPropRef.current = { seen: true, timeline };
      return;
    }

    deferredPropRef.current = { seen: false, timeline: null };
    if (timeline !== state.committed) {
      dispatch({ type: "sync", timeline });
    }
  }, [initialValue, state.committed]);

  const handleChange = useCallback((timeline: Timeline) => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    deferredPropRef.current = { seen: false, timeline: null };
    dispatch({ type: "begin", timeline });

    void (async () => {
      try {
        const result = await saveReadinessAction(timeline);
        if (!mountedRef.current) return;

        if (result.ok) {
          deferredPropRef.current = { seen: false, timeline: null };
          dispatch({ type: "succeeded", timeline: result.timeline });
        } else {
          const deferred = deferredPropRef.current;
          deferredPropRef.current = { seen: false, timeline: null };
          dispatch({
            type: "failed",
            message: errorMessage(result.error),
            rollbackTo: deferred.seen ? deferred.timeline : undefined,
          });
        }
      } catch {
        if (!mountedRef.current) return;

        const deferred = deferredPropRef.current;
        deferredPropRef.current = { seen: false, timeline: null };
        dispatch({
          type: "failed",
          message: "We couldn't save your availability. Try again.",
          rollbackTo: deferred.seen ? deferred.timeline : undefined,
        });
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, []);

  const handleDismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  return (
    <ReadinessSlider
      value={state.displayed}
      onChange={handleChange}
      saving={state.phase === "saving"}
      phase={state.phase}
      message={state.message}
      onDismiss={handleDismiss}
    />
  );
}
