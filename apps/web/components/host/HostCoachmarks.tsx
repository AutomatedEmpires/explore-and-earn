"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "@explore-and-earn/ui";

import styles from "./HostCoachmarks.module.css";

/**
 * The host workspace coachmarks (V2 D19) — what replaced the blocking modal.
 *
 * WHAT DIED, AND WHY. `OnboardingWalkthrough` was mounted in HostShell with
 * `autoStart`, so a host's FIRST view of their own workspace was a scrim, a
 * focus trap, `document.body.style.overflow = "hidden"`, and `aria-hidden` set
 * on every sibling of <body>. Three abstract steps described a product the host
 * could not see because the dialog was covering it, and the only way forward
 * was to dismiss it. D19 rejects that shape wholesale: the first thing a host
 * meets in the thing they are paying for should be the thing itself.
 *
 * WHAT REPLACED IT, point by point:
 *
 *   · ANCHORED. Each stop measures a real element by id and draws beside it,
 *     with `data-coachmark-target="active"` on the element itself so the
 *     workspace stylesheet can outline it. A stop whose target is not on screen
 *     is SKIPPED rather than floated — the activation banner only exists for a
 *     prospect, and a coachmark about a banner that is not there would be a
 *     tour of an imaginary page.
 *
 *   · ONE AT A TIME, AND NON-MODAL. `aria-modal="false"`, no scrim, no focus
 *     trap, no scroll lock, no body-sibling `aria-hidden`. The page underneath
 *     stays fully usable, which is the entire point: the host is meant to look
 *     at what the coachmark is pointing at.
 *
 *   · DISMISSIBLE AND PERSISTED. Escape or the close button ends it; finishing
 *     ends it; either way `localStorage` records that it is done and it never
 *     opens itself again. Progress mid-walk is recorded too, so a host who
 *     leaves at stop two resumes at stop two.
 *
 *   · RESUMABLE FROM HELP. `resetHostCoachmarks()` clears the record and
 *     `HOST_COACHMARK_EVENT` asks a mounted instance to reopen, which is how
 *     the Help centre's "Replay the workspace tour" button works without Help
 *     needing to know anything about this component's state.
 */

const STORAGE_KEY = "ee_host_coachmarks_v1";

/** Same-tab signal from Help to a mounted instance. */
export const HOST_COACHMARK_EVENT = "ee:host-coachmarks:start";

export interface HostCoachmarkStop {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Element id this stop anchors to. Missing element ⇒ stop is skipped. */
  readonly targetId: string;
}

/** Element ids the shell puts on the three things worth pointing at. */
export const HOST_COACHMARK_TARGETS = {
  rail: "host-coachmark-rail",
  create: "host-coachmark-create",
  activation: "host-coachmark-activation",
} as const;

/**
 * Three stops, and no more.
 *
 * The brief says two to three. That ceiling is the product decision, not a
 * placeholder: the modal this replaces also had three steps, and its problem
 * was never the count — it was that they interrupted. A fourth stop would start
 * rebuilding the thing that was removed.
 */
export const HOST_COACHMARK_STOPS: readonly HostCoachmarkStop[] = [
  {
    id: "rail",
    title: "Your workspace lives here",
    body: "The rail groups the recruiting loop in the order it happens — listings, applicants, outreach, messages — with the business and support sections below it.",
    targetId: HOST_COACHMARK_TARGETS.rail,
  },
  {
    id: "create",
    title: "Start with a role",
    body: "A draft costs nothing, is not discoverable, and takes no applications. Write it, preview it as a seeker sees it, and publish when you are ready.",
    targetId: HOST_COACHMARK_TARGETS.create,
  },
  {
    id: "activation",
    title: "Publishing is what a plan buys",
    body: "Building, branding, drafting and previewing are all free. This banner is here until you activate — it never blocks anything above it.",
    targetId: HOST_COACHMARK_TARGETS.activation,
  },
];

interface CoachmarkMemory {
  readonly index: number;
  readonly done: boolean;
}

const EMPTY_MEMORY: CoachmarkMemory = { index: 0, done: false };

function readMemory(): CoachmarkMemory {
  if (typeof window === "undefined") return EMPTY_MEMORY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<CoachmarkMemory>;
    const index =
      typeof parsed.index === "number" && Number.isFinite(parsed.index)
        ? Math.max(0, Math.trunc(parsed.index))
        : 0;
    return { index, done: parsed.done === true };
  } catch {
    // Private mode, quota, or a value someone else wrote. Treating a bad record
    // as "never seen" would re-open the walk on every load, which is the exact
    // nuisance this replaced — so a bad record reads as DONE.
    return { index: 0, done: true };
  }
}

function writeMemory(memory: CoachmarkMemory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Persistence is a convenience; losing it must never break the workspace.
  }
}

/** Clear the record so the walk can be replayed. Used by the Help centre. */
export function resetHostCoachmarks(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — the event below still reopens it for this session.
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface HostCoachmarksProps {
  /**
   * Whether the activation stop has anything to point at. Passed rather than
   * probed so the stop list is decided before the first paint.
   */
  readonly showActivationStop: boolean;
}

export function HostCoachmarks({ showActivationStop }: HostCoachmarksProps) {
  const stops = useMemo(
    () =>
      HOST_COACHMARK_STOPS.filter(
        (stop) => stop.id !== "activation" || showActivationStop,
      ),
    [showActivationStop],
  );

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const stop = stops[Math.min(index, stops.length - 1)];
  const isLast = index >= stops.length - 1;

  const finish = useCallback(() => {
    setOpen(false);
    setRect(null);
    writeMemory({ index: 0, done: true });
  }, []);

  // First mount: open only if the record says this host has not finished.
  useEffect(() => {
    const memory = readMemory();
    if (memory.done || stops.length === 0) return;
    setIndex(Math.min(memory.index, stops.length - 1));
    setOpen(true);
  }, [stops.length]);

  // Help's replay button clears the record and fires this.
  useEffect(() => {
    function onStart() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener(HOST_COACHMARK_EVENT, onStart);
    return () => window.removeEventListener(HOST_COACHMARK_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        finish();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, finish]);

  /*
   * Anchoring. The target may not be in the DOM on the first frame, so this
   * retries on an animation frame; and if it is STILL absent after a short
   * grace period the stop is skipped rather than rendered floating. Geometry is
   * only committed when the rounded numbers move — getBoundingClientRect hands
   * back a fresh object every frame, and committing unconditionally would
   * re-render the workspace sixty times a second for a panel standing still.
   */
  const targetId = open && stop ? stop.targetId : null;

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }

    let frame = 0;
    let cancelled = false;
    let element: HTMLElement | null = null;
    let last = "";
    let misses = 0;

    function measure() {
      if (cancelled) return;
      const found = targetId ? document.getElementById(targetId) : null;
      if (found) {
        misses = 0;
        if (found !== element) {
          element?.removeAttribute("data-coachmark-target");
          element = found;
          element.setAttribute("data-coachmark-target", "active");
          element.scrollIntoView({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
        }
        const next = found.getBoundingClientRect();
        const key = `${Math.round(next.top)}:${Math.round(next.left)}:${Math.round(next.width)}:${Math.round(next.height)}`;
        if (key !== last) {
          last = key;
          setRect(next);
        }
      } else {
        misses += 1;
        // ~1s at 60fps. Long enough for a streaming route, short enough that a
        // genuinely absent target does not hold the walk open.
        if (misses > 60) {
          setIndex((current) => current + 1);
          return;
        }
      }
      frame = window.requestAnimationFrame(measure);
    }

    frame = window.requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      element?.removeAttribute("data-coachmark-target");
    };
  }, [targetId]);

  // Advancing past the last stop finishes the walk.
  useEffect(() => {
    if (open && index >= stops.length) finish();
  }, [open, index, stops.length, finish]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, index]);

  const anchorStyle = useMemo(() => {
    if (!rect) return undefined;
    return {
      "--anchor-top": `${Math.round(rect.top)}px`,
      "--anchor-left": `${Math.round(rect.left)}px`,
      "--anchor-width": `${Math.round(rect.width)}px`,
      "--anchor-height": `${Math.round(rect.height)}px`,
    } as React.CSSProperties;
  }, [rect]);

  if (!open || !stop) return null;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      data-placement={rect ? "anchored" : "docked"}
      style={anchorStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby="host-coachmark-title"
      aria-describedby="host-coachmark-body"
      tabIndex={-1}
    >
      <div className={styles.top}>
        <p className={styles.step} aria-live="polite">
          Step {index + 1} of {stops.length}
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={finish}
          aria-label="Dismiss the workspace tour"
        >
          <Icon name="action.close" size={18} aria-hidden />
        </button>
      </div>

      <h2 id="host-coachmark-title" className={styles.title}>
        {stop.title}
      </h2>
      <p id="host-coachmark-body" className={styles.body}>
        {stop.body}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.skip} onClick={finish}>
          {isLast ? "Done" : "Skip"}
        </button>
        {isLast ? null : (
          <button
            type="button"
            className={styles.next}
            onClick={() => {
              const next = index + 1;
              setIndex(next);
              writeMemory({ index: next, done: false });
            }}
          >
            Next
            <Icon name="action.forward" size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
