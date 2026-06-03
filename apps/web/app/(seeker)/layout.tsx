import type { ReactNode } from "react";

import { SeekerBottomNav, SeekerHeader } from "../../components/seeker";
import styles from "./layout.module.css";

/**
 * Seeker scope layout.
 *
 * Navigation is scoped per user type — there is no single global bottom nav.
 * The seeker-scope bottom navigation is founder-locked (Swipe · Map · Seek ·
 * Profile) and OWNED BY THE SEEKER LANE, so it is wired here inside the (seeker)
 * route group via <SeekerBottomNav>. The locked tab set and order must not
 * change.
 */
export default function SeekerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SeekerHeader />
      <main className={styles.main}>{children}</main>
      <SeekerBottomNav />
    </div>
  );
}
