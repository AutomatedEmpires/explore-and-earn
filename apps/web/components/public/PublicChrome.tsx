"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";

import { GlobalHeader } from "../global/GlobalHeader";
import { DEV_ROLE_COOKIE, isDevRole } from "../../lib/devBench";
import {
  deriveClerkViewerSnapshot,
  isCurrentViewerRequest,
  isViewerNavigationResponse,
  type ClerkViewerState,
  type PublicViewerRole,
  type ViewerRoleResolution,
} from "../../lib/publicNavigation";
import { PublicBottomNav } from "./PublicBottomNav";
import styles from "./PublicShell.module.css";

type ViewerState = ClerkViewerState | "dev-bench";

interface PublicChromeProps {
  readonly children: ReactNode;
  readonly clerkConfigured: boolean;
  readonly devBenchEnabled: boolean;
}

interface ChromeFrameProps {
  readonly children: ReactNode;
  readonly role: PublicViewerRole;
  readonly state: ViewerState;
  readonly userId?: string;
}

function ChromeFrame({ children, role, state, userId }: ChromeFrameProps) {
  const isAuthenticated = role !== "guest";

  return (
    <div
      className={styles.frame}
      data-public-viewer-role={role}
      data-public-viewer-state={state}
    >
      <GlobalHeader
        viewerRole={role}
        isAuthenticated={isAuthenticated}
        clerkUserId={userId}
      />
      <main className={styles.main}>{children}</main>
      {role === "guest" || role === "seeker" ? (
        <PublicBottomNav viewerRole={role} />
      ) : null}
    </div>
  );
}

function readDevBenchRole(): PublicViewerRole {
  const prefix = `${DEV_ROLE_COOKIE}=`;
  const raw = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);

  if (!raw) return "guest";

  try {
    const role = decodeURIComponent(raw);
    return isDevRole(role) ? role : "guest";
  } catch {
    return "guest";
  }
}

function DevBenchPublicChrome({ children }: { readonly children: ReactNode }) {
  const [role, setRole] = useState<PublicViewerRole>("guest");

  useEffect(() => {
    setRole(readDevBenchRole());
  }, []);

  return (
    <ChromeFrame role={role} state="dev-bench">
      {children}
    </ChromeFrame>
  );
}

function ClerkPublicChrome({ children }: { readonly children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const activeUserId = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [resolution, setResolution] = useState<ViewerRoleResolution | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isLoaded || !isSignedIn || !userId) {
      activeUserId.current = null;
      return;
    }

    const requestUserId = userId;
    const controller = new AbortController();
    activeUserId.current = requestUserId;
    setResolution({ userId: requestUserId, role: null, state: "resolving" });

    async function resolveViewerRole() {
      try {
        const response = await fetch("/api/viewer/navigation", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Viewer navigation returned ${response.status}`);
        }

        const payload: unknown = await response.json();
        if (!isViewerNavigationResponse(payload)) {
          throw new Error("Viewer navigation returned an invalid response");
        }

        if (!isCurrentViewerRequest(activeUserId.current, requestUserId)) return;
        setResolution({
          userId: requestUserId,
          role: payload.role,
          state: "resolved",
        });
      } catch {
        if (
          controller.signal.aborted ||
          !isCurrentViewerRequest(activeUserId.current, requestUserId)
        ) {
          return;
        }

        setResolution({
          userId: requestUserId,
          role: null,
          state: "fallback",
        });
      }
    }

    void resolveViewerRole();

    return () => {
      controller.abort();
      if (activeUserId.current === requestUserId) {
        activeUserId.current = null;
      }
    };
  }, [hydrated, isLoaded, isSignedIn, userId]);

  const snapshot = deriveClerkViewerSnapshot(
    { hydrated, isLoaded, isSignedIn, userId },
    resolution,
  );

  return (
    <ChromeFrame
      role={snapshot.role}
      state={snapshot.state}
      userId={snapshot.userId}
    >
      {children}
    </ChromeFrame>
  );
}

/**
 * Keeps public pages static: SSR always emits guest chrome, then the client
 * resolves authenticated navigation without pulling request auth into an ISR
 * or marketing Server Component. The Clerk hook is isolated in a child that is
 * mounted only when the root layout also mounted ClerkProvider.
 */
export function PublicChrome({
  children,
  clerkConfigured,
  devBenchEnabled,
}: PublicChromeProps) {
  if (devBenchEnabled) {
    return <DevBenchPublicChrome>{children}</DevBenchPublicChrome>;
  }

  if (clerkConfigured) {
    return <ClerkPublicChrome>{children}</ClerkPublicChrome>;
  }

  return (
    <ChromeFrame role="guest" state="guest">
      {children}
    </ChromeFrame>
  );
}
