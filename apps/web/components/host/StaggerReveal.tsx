import { Children, type ReactNode } from "react";

import styles from "./StaggerReveal.module.css";

/**
 * StaggerReveal — CSS-first "things falling into place" entrance for a column of
 * sections. Each direct child rises + fades in, staggered.
 *
 * Visibility is NEVER gated on JS. The prior Framer-Motion version set
 * initial="hidden", which renders the SSR HTML at opacity:0 — so a slow or
 * failed hydration trapped the whole dashboard blank (observed in review). Here
 * the resting state is fully visible; the rise/fade is applied ONLY inside
 * `prefers-reduced-motion: no-preference` via a pure-CSS animation that needs no
 * JS. Reduced-motion (and any no-animation fallback) shows everything instantly.
 *
 * motion-system.md: transform+opacity only, locked ease-out, no bounce. Server
 * component — no "use client", no client JS shipped for the reveal.
 */
export function StaggerReveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={className ? `${styles.stagger} ${className}` : styles.stagger}>
      {Children.map(children, (child) =>
        child == null ? child : <div className={styles.item}>{child}</div>,
      )}
    </div>
  );
}
