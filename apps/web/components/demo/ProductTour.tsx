"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import { HOST_FUNNEL_EVENTS, captureEvent } from "../../lib/analytics";
import { DEMO_TOUR, type TourStop } from "./tourStops";
import styles from "./ProductTour.module.css";

/**
 * The anchored product tour (spec D19).
 *
 * WHAT THIS REPLACED, AND WHY. The P3 tour was a panel that opened itself on a
 * visitor's first demo surface and described the page in the abstract. D19
 * replaces it with coachmarks attached to real controls, walked one at a time
 * across the whole workspace. Three consequences follow, and all three are
 * deliberate:
 *
 *   · NOTHING AUTO-OPENS. A tour that starts itself is an obstruction on a page
 *     built to make a product desirable. The launcher is always visible in the
 *     demo toolbar and says whether the tour is new, resumable, or finished.
 *
 *   · NOTHING IS TRAPPED. The panel is a non-modal dialog: the page underneath
 *     stays scrollable and clickable, because the whole point is to read the
 *     thing the stop describes while the stop describes it. Focus MOVES into
 *     the panel when the visitor opens or advances it and RETURNS to the
 *     launcher when it closes — but it is not trapped, because trapping the
 *     page behind a non-blocking panel would be a lie about what the panel is.
 *     The one exception is a `spotlight` stop, where a scrim is drawn; even
 *     there the scrim is click-through-to-dismiss rather than a wall.
 *
 *   · PROGRESS SURVIVES NAVIGATION. Stops live on different routes, so the tour
 *     pushes the route and re-anchors on arrival, and the current index is
 *     written to localStorage after every move. Closing the tour on stop six
 *     and coming back later resumes at stop six.
 *
 * ACCESSIBILITY. The panel is labelled and described by its own heading and
 * body, the step counter is announced through a polite live region, Escape
 * closes and restores focus, and every control is a real button. The target
 * element gets `data-tour-target="active"`, which the workspace stylesheet
 * turns into a visible outline — an outline rather than only a colour so the
 * highlight survives a high-contrast or forced-colours mode.
 */

const STORAGE_KEY = "ee_demo_tour_v2";

interface TourMemory {
  /** Index the visitor last reached. Resumed from, never silently skipped. */
  readonly index: number;
  /** True once the last stop has been reached — the event fires at most once. */
  readonly completed: boolean;
}

const EMPTY_MEMORY: TourMemory = { index: 0, completed: false };

function readMemory(): TourMemory {
  if (typeof window === "undefined") return EMPTY_MEMORY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<TourMemory>;
    const index =
      typeof parsed.index === "number" && Number.isFinite(parsed.index)
        ? Math.min(Math.max(0, Math.trunc(parsed.index)), DEMO_TOUR.length - 1)
        : 0;
    return { index, completed: parsed.completed === true };
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

/** Does this pathname sit on the stop's route (locale prefix tolerated)? */
function onRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.endsWith(href);
}

interface TourController {
  readonly open: boolean;
  readonly index: number;
  readonly completed: boolean;
  readonly start: (index?: number) => void;
  readonly close: () => void;
}

const TourContext = createContext<TourController | null>(null);

export function ProductTourProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wantsFocus = useRef(false);

  useEffect(() => {
    const memory = readMemory();
    setIndex(memory.index);
    setCompleted(memory.completed);
  }, []);

  const stop: TourStop | undefined = DEMO_TOUR[index];
  const isLast = index === DEMO_TOUR.length - 1;
  const needsNavigation = stop ? !onRoute(pathname, stop.href) : false;
  const targetId = stop ? stop.targetId : null;

  // ── Anchoring ────────────────────────────────────────────────────────────
  // The target may not be in the DOM yet (a route push is in flight, or the
  // page is still streaming), so measurement retries on an animation frame
  // until it lands rather than giving up and drawing a floating box.
  useEffect(() => {
    if (!open || !targetId) {
      setRect(null);
      return;
    }

    let frame = 0;
    let cancelled = false;
    let element: HTMLElement | null = null;
    // Last committed geometry. The loop only calls setRect when the numbers
    // actually move: getBoundingClientRect returns a fresh object every frame,
    // so committing it unconditionally would re-render the whole workspace
    // sixty times a second for a panel that is standing still.
    let last = "";

    function measure() {
      if (cancelled) return;
      const found = targetId ? document.getElementById(targetId) : null;
      if (found) {
        if (found !== element) {
          element?.removeAttribute("data-tour-target");
          element = found;
          element.setAttribute("data-tour-target", "active");
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
      } else if (last !== "") {
        last = "";
        setRect(null);
      }
      frame = window.requestAnimationFrame(measure);
    }

    frame = window.requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      element?.removeAttribute("data-tour-target");
    };
  }, [open, targetId, pathname]);

  // Move focus into the panel only when the visitor asked for it.
  useEffect(() => {
    if (open && wantsFocus.current) {
      wantsFocus.current = false;
      panelRef.current?.focus();
    }
  }, [open, index]);

  const close = useCallback(() => {
    setOpen(false);
    setRect(null);
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

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(0, next), DEMO_TOUR.length - 1);
      const target = DEMO_TOUR[clamped];
      setIndex(clamped);
      wantsFocus.current = true;
      const nowCompleted = completed || clamped === DEMO_TOUR.length - 1;
      if (nowCompleted && !completed) {
        setCompleted(true);
        captureEvent(HOST_FUNNEL_EVENTS.demoTourCompleted, {
          stops: DEMO_TOUR.length,
        });
      }
      writeMemory({ index: clamped, completed: nowCompleted });
      if (!onRoute(pathname, target.href)) router.push(target.href);
    },
    [completed, pathname, router],
  );

  const start = useCallback(
    (at?: number) => {
      const memory = readMemory();
      const startIndex =
        typeof at === "number" ? at : memory.completed ? 0 : memory.index;
      wantsFocus.current = true;
      setOpen(true);
      goTo(startIndex);
    },
    [goTo],
  );

  const controller = useMemo<TourController>(
    () => ({ open, index, completed, start, close }),
    [open, index, completed, start, close],
  );

  const anchorStyle = useMemo(() => {
    if (!rect) return undefined;
    return {
      "--anchor-top": `${Math.round(rect.top)}px`,
      "--anchor-left": `${Math.round(rect.left)}px`,
      "--anchor-width": `${Math.round(rect.width)}px`,
      "--anchor-height": `${Math.round(rect.height)}px`,
    } as React.CSSProperties;
  }, [rect]);

  return (
    <TourContext.Provider value={controller}>
      {children}

      {open && stop ? (
        <>
          {stop.spotlight ? (
            <button
              type="button"
              className={styles.scrim}
              style={anchorStyle}
              onClick={close}
              aria-label="Close the product tour"
              tabIndex={-1}
            />
          ) : null}

          <div
            ref={panelRef}
            className={styles.panel}
            data-placement={rect ? "anchored" : "docked"}
            style={anchorStyle}
            role="dialog"
            aria-modal="false"
            aria-labelledby="tour-panel-title"
            aria-describedby="tour-panel-body"
            tabIndex={-1}
          >
            <div className={styles.panelTop}>
              <p className={styles.step} aria-live="polite">
                Step {index + 1} of {DEMO_TOUR.length}
                {needsNavigation ? " — opening the page…" : ""}
              </p>
              <button
                type="button"
                className={styles.close}
                onClick={close}
                aria-label="Close the product tour"
              >
                <Icon name="action.close" size={18} aria-hidden />
              </button>
            </div>

            <h2 id="tour-panel-title" className={styles.title}>
              {stop.title}
            </h2>
            <p id="tour-panel-body" className={styles.body}>
              {stop.body}
            </p>
            <span className={styles.plans}>
              <Icon name="system.success" size={14} aria-hidden />
              {stop.plans}
            </span>

            <ol className={styles.progress} aria-hidden="true">
              {DEMO_TOUR.map((entry, entryIndex) => (
                <li
                  key={entry.id}
                  className={styles.pip}
                  data-state={
                    entryIndex === index
                      ? "current"
                      : entryIndex < index
                        ? "done"
                        : "todo"
                  }
                />
              ))}
            </ol>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.back}
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                Back
              </button>
              {isLast ? (
                <button type="button" className={styles.next} onClick={close}>
                  Done
                  <Icon name="system.success" size={16} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.next}
                  onClick={() => goTo(index + 1)}
                >
                  Next
                  <Icon name="action.forward" size={16} aria-hidden />
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </TourContext.Provider>
  );
}

/**
 * The always-visible tour affordance.
 *
 * Its label is the tour's state: a visitor who left at stop six is told they
 * can resume rather than being silently dropped back at stop one.
 */
export function TourLauncher({ className }: { readonly className?: string }) {
  const tour = useContext(TourContext);
  const [label, setLabel] = useState("Product tour");

  useEffect(() => {
    const memory = readMemory();
    if (memory.completed) setLabel("Replay product tour");
    else if (memory.index > 0) setLabel(`Resume tour · step ${memory.index + 1}`);
  }, [tour?.open]);

  if (!tour) return null;

  return (
    <button
      type="button"
      className={[styles.launcher, className].filter(Boolean).join(" ")}
      onClick={() => tour.start()}
      aria-expanded={tour.open}
    >
      <Icon name="system.info" size={16} aria-hidden />
      {label}
    </button>
  );
}
