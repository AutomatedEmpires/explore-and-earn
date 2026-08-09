"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { hostOnboardingIdentityKey } from "./hostOnboardingDraft";

interface HostOnboardingIdentityValue {
  readonly isLoaded: boolean;
  readonly identity: string | null;
}

const HostOnboardingIdentityContext =
  createContext<HostOnboardingIdentityValue | null>(null);

function ClerkHostOnboardingIdentity({ children }: { readonly children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const value = useMemo(
    () => ({ isLoaded, identity: userId ?? null }),
    [isLoaded, userId],
  );
  return (
    <HostOnboardingIdentityContext.Provider
      key={hostOnboardingIdentityKey(value.identity)}
      value={value}
    >
      {children}
    </HostOnboardingIdentityContext.Provider>
  );
}

/**
 * Production follows Clerk reactively so an account switch closes the old
 * draft before restoring the new one. The dev bench supplies a synthetic,
 * role-scoped identity and never invokes Clerk, preserving keyless QA.
 */
export function HostOnboardingIdentityProvider({
  children,
  devIdentity,
}: {
  readonly children: ReactNode;
  readonly devIdentity?: string;
}) {
  if (!devIdentity) {
    return <ClerkHostOnboardingIdentity>{children}</ClerkHostOnboardingIdentity>;
  }

  return (
    <HostOnboardingIdentityContext.Provider
      key={hostOnboardingIdentityKey(devIdentity)}
      value={{ isLoaded: true, identity: devIdentity }}
    >
      {children}
    </HostOnboardingIdentityContext.Provider>
  );
}

export function useHostOnboardingIdentity(): HostOnboardingIdentityValue {
  const value = useContext(HostOnboardingIdentityContext);
  if (!value) {
    throw new Error("Host onboarding identity provider is missing.");
  }
  return value;
}
