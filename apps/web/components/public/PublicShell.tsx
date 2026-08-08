import type { ReactNode } from "react";

import { isDevBenchEnabled } from "../../lib/devBench";
import { PublicChrome } from "./PublicChrome";

/**
 * The single shared chrome for every public / marketing surface. It stays a
 * static Server Component; the client controller begins as a guest and then
 * resolves role-correct destinations without making marketing routes dynamic.
 * Role dashboards keep their own OS shells (seeker/host/admin); focused flows
 * (auth, onboarding) use the lighter EntryShell.
 */
export function PublicShell({ children }: { readonly children: ReactNode }) {
  return (
    <PublicChrome
      clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
      devBenchEnabled={isDevBenchEnabled()}
    >
      {children}
    </PublicChrome>
  );
}
