import Link from "next/link";

import { DEV_ROLES, isDevBenchEnabled } from "../../lib/devBench";
import { readDevRole } from "../../lib/devBench/server";
import { setDevRoleAction } from "../../app/(dev)/dev/actions";
import styles from "./DevBenchToolbar.module.css";

/**
 * Dev Mock Bench floating toolbar (review tooling only).
 *
 * Rendered in the root layout only when isDevBenchEnabled() — i.e. never in a
 * production or preview build. Shows the impersonated role and switches it via
 * server-action forms (no client JS). Role switches land on that lane's home.
 */
export async function DevBenchToolbar() {
  if (!isDevBenchEnabled()) return null;
  const current = await readDevRole();

  return (
    <aside className={styles.bar} aria-label="Dev mock bench">
      <span className={styles.badge}>DEV BENCH</span>
      <span className={styles.note}>not production</span>
      <div className={styles.roles}>
        {DEV_ROLES.map((role) => (
          <form key={role} action={setDevRoleAction}>
            <input type="hidden" name="role" value={role} />
            <button
              type="submit"
              className={current === role ? styles.roleActive : styles.role}
              aria-current={current === role ? "true" : undefined}
            >
              {role}
            </button>
          </form>
        ))}
      </div>
      <Link href="/dev" className={styles.index}>
        All surfaces →
      </Link>
    </aside>
  );
}
