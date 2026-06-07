import styles from "./StatCard.module.css";

export interface StatCardProps {
  readonly label: string;
  readonly value: number | string;
  readonly hint?: string;
}

/** A single labelled marketplace metric tile for the admin dashboard grid. */
export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
