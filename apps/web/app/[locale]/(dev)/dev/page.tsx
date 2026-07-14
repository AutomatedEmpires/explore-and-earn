import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DEV_SURFACES } from "../../../../components/dev/surfaces";
import { DEV_ROLES, isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import { setDevRoleAction } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Dev Mock Bench",
  robots: { index: false, follow: false },
};

/**
 * Dev Mock Bench launcher (review tooling only). Pick a role to impersonate,
 * then jump to any surface. Returns 404 when the bench is disabled, so it never
 * exists in production/preview.
 */
export default async function DevBenchPage() {
  if (!isDevBenchEnabled()) notFound();
  const current = await readDevRole();

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>DEV BENCH · not production</p>
        <h1 className={styles.title}>Mock Bench</h1>
        <p className={styles.lede}>
          Review every surface as any role, with mock data — no Clerk login. This
          page only exists under <code>next dev</code>.
        </p>
      </header>

      <section className={styles.roleRow} aria-label="Impersonate a role">
        <span className={styles.roleLabel}>
          Impersonating: <strong>{current ?? "nobody yet"}</strong>
        </span>
        <div className={styles.roleButtons}>
          {DEV_ROLES.map((role) => (
            <form key={role} action={setDevRoleAction}>
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="redirectTo" value="/dev" />
              <button
                type="submit"
                className={current === role ? styles.roleActive : styles.role}
              >
                {role}
              </button>
            </form>
          ))}
        </div>
      </section>

      <div className={styles.lanes}>
        {DEV_SURFACES.map((group) => (
          <section key={group.lane} className={styles.lane}>
            <h2 className={styles.laneTitle}>{group.lane}</h2>
            <ul className={styles.links}>
              {group.surfaces.map((surface) => (
                <li key={surface.href}>
                  <Link href={surface.href} className={styles.link}>
                    {surface.label}
                    <span className={styles.href}>{surface.href}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
