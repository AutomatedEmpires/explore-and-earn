import { Icon } from "@explore-and-earn/ui";

import styles from "./HostUsageMeters.module.css";

/**
 * Plan-usage meters (V2 D21, §13).
 *
 * ONE RULE: A METER IS ONLY DRAWN WHERE BOTH NUMBERS ARE REAL. `used` and
 * `included` both come from the account — the count from the host's own rows,
 * the allowance from the pricing contract the database enforces — and a row
 * whose allowance could not be resolved renders as a STATEMENT rather than a
 * bar at zero. That distinction is the whole reason `included` is nullable
 * here: "0 of 0" and "we could not read your allowance" look identical as a
 * bar, and only one of them is a fact.
 */

export interface HostUsageRow {
  readonly id: string;
  readonly label: string;
  readonly used: number;
  /** Null when the allowance genuinely could not be read — never defaulted. */
  readonly included: number | null;
  readonly note: string;
}

export interface HostUsageMetersProps {
  readonly rows: readonly HostUsageRow[];
}

export function HostUsageMeters({ rows }: HostUsageMetersProps) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const known = row.included !== null;
        const pct =
          known && row.included !== null && row.included > 0
            ? Math.min(100, Math.round((row.used / row.included) * 100))
            : 0;
        const atLimit = known && row.included !== null && row.used >= row.included;
        return (
          <li key={row.id} className={styles.row}>
            <div className={styles.top}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.count}>
                {known ? `${row.used} of ${row.included}` : `${row.used} used`}
              </span>
            </div>
            {known ? (
              <span
                className={styles.track}
                role="img"
                aria-label={`${row.label}: ${row.used} of ${row.included} used`}
              >
                <span
                  className={styles.fill}
                  data-at-limit={atLimit ? "true" : "false"}
                  style={{ "--fill": `${pct}%` } as React.CSSProperties}
                />
              </span>
            ) : (
              <p className={styles.unknown}>
                <Icon name="system.warning" size={14} aria-hidden />
                Allowance unavailable right now — the count above is real, the
                limit could not be read.
              </p>
            )}
            <span className={styles.note}>{row.note}</span>
          </li>
        );
      })}
    </ul>
  );
}
