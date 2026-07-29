"use client";

import { useCallback, useOptimistic, useTransition } from "react";

import { saveReadinessAction } from "../../app/actions/seekerProfile";
import { ReadinessSlider } from "./ReadinessSlider";

/**
 * The one client island on the seeker dashboard: the availability window
 * control, with its optimistic save. Everything around it renders on the
 * server so every time-derived string is computed exactly once per request.
 */
export function ReadinessIsland({
  initialValue,
}: {
  readonly initialValue: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTimeline, setOptimisticTimeline] = useOptimistic<string | null>(
    initialValue,
  );

  const handleChange = useCallback(
    (value: string) => {
      startTransition(async () => {
        setOptimisticTimeline(value);
        await saveReadinessAction(value);
      });
    },
    [setOptimisticTimeline],
  );

  return (
    <ReadinessSlider
      value={optimisticTimeline}
      onChange={handleChange}
      saving={isPending}
    />
  );
}
