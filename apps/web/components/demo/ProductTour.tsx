"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@explore-and-earn/ui";

import { HOST_FUNNEL_EVENTS, captureEvent } from "../../lib/analytics";
import { DEMO_SURFACES } from "./enterpriseDemo";
import { DEMO_TOUR, type TourStop } from "./tourStops";
import styles from "./ProductTour.module.css";

const STORAGE_KEY = "ee_demo_tour_v1";

interface TourMemory {
  /** Surface ids whose tour has been walked to the end. */
  readonly done: readonly string[];
  /** True once host_demo_tour_completed has fired — it fires at most once. */
  readonly completed: boolean;
  /** True once the tour has auto-opened, so it never auto-opens again. */
  readonly greeted: boolean;
}

const EMPTY_MEMORY: TourMemory = { done: [], completed: false, greeted: false };

/** Surfaces that actually have stops — the set "completed" is measured against. */
const TOURED_SURFACES = DEMO_SURFACES.filter(
  (surface) => (DEMO_TOUR[surface.id]?.length ?? 0) > 0,
).map((surface) => surface.id);

function readMemory(): TourMemory {
  if (typeof window === "undefined") return EMPTY_MEMORY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<TourMemory>;
    return {
      done: Array.isArray(parsed.done)
        ? parsed.done.filter((id): id is string => typeof id === "string")
        : [],
      completed: parsed.completed === true,
      greeted: parsed.greeted === true,
    };
  } catch {
    // Private mode, quota, or a value someone else wrote. Start clean rather
    // than throwing inside a marketing page.
    return EMPTY_MEMORY;
  }
}

function writeMemory(memory: TourMemory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Persistence is a convenience; losing it must never break the tour.
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface ProductTourProps {
  /** A key of DEMO_TOUR — the surface whose stops this instance walks. */
  readonly surfaceId: string;
}

/**
 * Contextual product tour (spec D8).
 *
 * ONE popup at a time and no scrim: this is a coachmark, not a modal, so the
 * visitor can read the thing the stop is describing while the stop describes
 * it. That choice drives the accessibility model — focus MOVES into the panel
 * when the visitor opens it and RETURNS to the launcher when it closes, but
 * focus is not trapped, because trapping the page behind a non-blocking panel
 * would be a lie about what the panel is.
 *
 * The tour auto-opens once, ever, on a visitor's first demo surface. After that
 * it is launcher-only: a tour that reopens itself on every page is an
 * obstruction, and the founder's brief is to make the product desirable, not
 * unavoidable.
 */
export function ProductTour({ surfaceId }: ProductTourProps) {
  const stops: readonly TourStop[] = DEMO_TOUR[surfaceId] ?? [];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [walked, setWalked] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef(false);

  // First visit ever: greet once, without stealing focus (an unrequested focus
  // jump on page load is disorienting for screen-reader and keyboard users).
  useEffect(() => {
    if (stops.length === 0) return;
    const memory = readMemory();
    setWalked(memory.done.includes(surfaceId));
    if (!memory.greeted) {
      writeMemory({ ...memory, greeted: true });
      setOpen(true);
    }
  }, [surfaceId, stops.length]);

  // Highlight + reveal the element this stop is about.
  useEffect(() => {
    if (!open) return;
    const targetId = stops[index]?.targetId;
    if (!targetId) return;
    const element = document.getElementById(targetId);
    if (!element) return;
    element.setAttribute("data-tour-target", "active");
    element.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    return () => {
      element.removeAttribute("data-tour-target");
    };
  }, [open, index, stops]);

  // Move focus into the panel only when the visitor asked for it.
  useEffect(() => {
    if (open && restoreFocus.current) {
      panelRef.current?.focus();
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    if (restoreFocus.current) {
      launcherRef.current?.focus();
      restoreFocus.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const finish = useCallback(() => {
    const memory = readMemory();
    const done = memory.done.includes(surfaceId)
      ? memory.done
      : [...memory.done, surfaceId];
    const allWalked = TOURED_SURFACES.every((id) => done.includes(id));
    const completed = memory.completed || allWalked;
    writeMemory({ done, completed, greeted: true });
    setWalked(true);
    // Fire once, and only when every toured surface has actually been walked.
    if (allWalked && !memory.completed) {
      captureEvent(HOST_FUNNEL_EVENTS.hostDemoTourCompleted, {
        surfaces: TOURED_SURFACES.length,
      });
    }
    close();
  }, [surfaceId, close]);

  if (stops.length === 0) return null;

  const stop = stops[index];
  const isLast = index === stops.length - 1;
  const titleId = `tour-title-${surfaceId}`;
  const bodyId = `tour-body-${surfaceId}`;

  return (
    <>
      <button
        type="button"
        ref={launcherRef}
        className={styles.launcher}
        aria-expanded={open}
        onClick={() => {
          restoreFocus.current = true;
          setIndex(0);
          setOpen(true);
        }}
      >
        <Icon name="system.info" size={16} aria-hidden />
        {walked ? "Replay this tour" : "Show me around"}
      </button>

      {open ? (
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
        >
          <div className={styles.panelTop}>
            <span className={styles.step}>
              Step {index + 1} of {stops.length}
            </span>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close the tour"
            >
              <Icon name="action.close" size={18} aria-hidden />
            </button>
          </div>

          <h2 id={titleId} className={styles.title}>
            {stop.title}
          </h2>
          <p id={bodyId} className={styles.body}>
            {stop.body}
          </p>
          <span className={styles.plans}>
            <Icon name="system.success" size={14} aria-hidden />
            {stop.plans}
          </span>

          <div className={styles.actions}>
            {index > 0 ? (
              <button
                type="button"
                className={styles.back}
                onClick={() => setIndex((current) => Math.max(0, current - 1))}
              >
                Back
              </button>
            ) : null}
            {isLast ? (
              <button type="button" className={styles.next} onClick={finish}>
                Done
                <Icon name="system.success" size={16} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className={styles.next}
                onClick={() =>
                  setIndex((current) => Math.min(stops.length - 1, current + 1))
                }
              >
                Next
                <Icon name="action.forward" size={16} aria-hidden />
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
