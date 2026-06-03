import type { ReactNode } from "react";

import { SeekerHeader } from "../../components/seeker";
import styles from "./layout.module.css";

/**
 * Seeker scope layout (Phase A: Home + lifecycle buckets).
 *
 * The seeker bottom navigation is founder-locked — Swipe · Map · Seek · Profile
 * — and is owned by the App Shell lane. It is intentionally NOT re-implemented
 * here to avoid a duplicate shell. This layout provides the seeker context
 * header + page container only.
 */
export default function SeekerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SeekerHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
