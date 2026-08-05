"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { SeekerOnboardingDraft } from "./seekerOnboardingModel";

interface SeekerOnboardingContextValue {
  readonly draft: SeekerOnboardingDraft;
  readonly updateDraft: (patch: Partial<SeekerOnboardingDraft>) => void;
}

const SeekerOnboardingContext =
  createContext<SeekerOnboardingContextValue | null>(null);

export function SeekerOnboardingProvider({
  initialDraft,
  children,
}: {
  readonly initialDraft: SeekerOnboardingDraft;
  readonly children: ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const updateDraft = useCallback(
    (patch: Partial<SeekerOnboardingDraft>) => {
      setDraft((current) => ({ ...current, ...patch }));
    },
    [],
  );
  const value = useMemo<SeekerOnboardingContextValue>(
    () => ({
      draft,
      updateDraft,
    }),
    [draft, updateDraft],
  );

  return (
    <SeekerOnboardingContext.Provider value={value}>
      {children}
    </SeekerOnboardingContext.Provider>
  );
}

export function useSeekerOnboarding(): SeekerOnboardingContextValue {
  const value = useContext(SeekerOnboardingContext);
  if (!value) {
    throw new Error(
      "useSeekerOnboarding must be used inside SeekerOnboardingProvider",
    );
  }
  return value;
}
