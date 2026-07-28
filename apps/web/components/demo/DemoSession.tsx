"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { HOST_FUNNEL_EVENTS, captureEvent } from "../../lib/analytics";
import {
  DEMO_APPLICANTS,
  applyStageOverrides,
  type DemoApplicant,
  type DemoStage,
} from "./enterpriseDemo";

/**
 * Session-local demo interactivity (spec D20).
 *
 * The demo is READ-ONLY against everything that persists. A visitor can drag a
 * candidate between stages and watch every aggregate on the page move with
 * them, and none of it touches a database, a server action, or even
 * localStorage: the overrides live in sessionStorage, so they die with the tab.
 *
 * WHY SESSIONSTORAGE AND NOT LOCALSTORAGE. The tour's progress is worth
 * remembering across visits — it is about the visitor. A rearranged pipeline is
 * not: coming back a week later to a workspace someone else's session shuffled
 * would make the sample data look like real data that had changed. Canon is the
 * default state, and "Reset demo" restores it explicitly.
 *
 * THE AGGREGATES FOLLOW. Consumers read `applicants` from here and pass it to
 * the derivation functions in enterpriseDemo.ts. Because every aggregate is a
 * fold over that list, moving one candidate moves the stage tally, the funnel,
 * the qualified-match count and the per-role diagnosis together — there is no
 * cached total that can be left behind.
 */

const STORAGE_KEY = "ee_demo_session_v2";

type StageOverrides = Readonly<Record<string, DemoStage>>;

export interface DemoSessionValue {
  /** The canon records with any session-local stage moves applied. */
  readonly applicants: readonly DemoApplicant[];
  /** How many candidates have been moved away from their canon stage. */
  readonly movedCount: number;
  readonly moveStage: (applicantId: string, stage: DemoStage) => void;
  readonly reset: () => void;
  /** False until the sessionStorage read has happened (avoids hydration drift). */
  readonly ready: boolean;
}

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

function readOverrides(): StageOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, DemoStage> = {};
    for (const [id, stage] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof stage === "string") out[id] = stage as DemoStage;
    }
    return out;
  } catch {
    // Private mode, a quota error, or a value someone else wrote. Canon is the
    // safe answer: a demo that throws while restoring a toy state is worse than
    // a demo that starts from the beginning.
    return {};
  }
}

function writeOverrides(overrides: StageOverrides): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Persistence is a convenience; losing it must never break the surface.
  }
}

export function DemoSessionProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<StageOverrides>({});
  const [ready, setReady] = useState(false);

  // Read AFTER mount, never during render: the server rendered canon, and
  // reading storage during the first render would produce a hydration mismatch
  // on exactly the surfaces this provider exists to keep honest.
  useEffect(() => {
    setOverrides(readOverrides());
    setReady(true);
  }, []);

  const moveStage = useCallback((applicantId: string, stage: DemoStage) => {
    setOverrides((current) => {
      const next = { ...current, [applicantId]: stage };
      writeOverrides(next);
      return next;
    });
    captureEvent(HOST_FUNNEL_EVENTS.demoStageMoved, { stage });
  }, []);

  const reset = useCallback(() => {
    setOverrides({});
    writeOverrides({});
    captureEvent(HOST_FUNNEL_EVENTS.demoReset, {});
  }, []);

  const value = useMemo<DemoSessionValue>(() => {
    // The override rule itself lives in enterpriseDemo.ts so it can be tested
    // without a DOM — see applyStageOverrides. Reset is this call with {}.
    const applicants = applyStageOverrides(overrides);
    const movedCount = DEMO_APPLICANTS.reduce((total, applicant) => {
      const stage = overrides[applicant.id];
      return stage && stage !== applicant.stage ? total + 1 : total;
    }, 0);
    return { applicants, movedCount, moveStage, reset, ready };
  }, [overrides, moveStage, reset, ready]);

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
    </DemoSessionContext.Provider>
  );
}

/**
 * Read the session state.
 *
 * Falls back to canon outside a provider rather than throwing: a demo
 * presentational component rendered in a test or a Storybook-style harness
 * should show the canonical workspace, not an error boundary.
 */
export function useDemoSession(): DemoSessionValue {
  const context = useContext(DemoSessionContext);
  if (context) return context;
  return {
    applicants: DEMO_APPLICANTS,
    movedCount: 0,
    moveStage: () => {},
    reset: () => {},
    ready: false,
  };
}
