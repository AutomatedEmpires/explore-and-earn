import type { ReactNode } from "react";

import { GlobalHeader } from "../global";
import { PublicBottomNav } from "./PublicBottomNav";
import styles from "./PublicShell.module.css";

/**
 * The single shared chrome for every public / marketing surface: one guest
 * header + one sticky bottom nav (the global SiteFooter renders beneath, from
 * the root layout). Use this on every page a signed-out visitor can land on so
 * the header, footer, and bottom nav are IDENTICAL everywhere. Role dashboards
 * keep their own OS shells (seeker/host/admin); focused flows (auth, onboarding)
 * use the lighter EntryShell.
 */
export function PublicShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <GlobalHeader scope="guest" isAuthenticated={false} />
      <main className={styles.main}>{children}</main>
      <PublicBottomNav />
    </div>
  );
}
