import type { ReactNode } from "react";

import { HostBottomNav, HostHeader } from "../../components/host";
import styles from "./layout.module.css";

/**
 * Host scope layout.
 *
 * Navigation is scoped per user type (founder canon) — there is no single
 * global bottom nav. The host-scope bottom navigation (Dashboard · Listings ·
 * Applicants · Messages · Profile) is OWNED BY THE HOST LANE and wired here
 * inside the (host) route group via <HostBottomNav>. It does not reuse the
 * app-shell tab set or the locked seeker nav. Host routes live under the /host
 * URL prefix so they never collide with the seeker scope's top-level routes.
 */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <HostHeader />
      <main className={styles.main}>{children}</main>
      <HostBottomNav />
    </div>
  );
}
