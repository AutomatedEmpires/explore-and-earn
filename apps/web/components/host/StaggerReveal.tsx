"use client";

import { Children, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * StaggerReveal — spring-physics "things falling into place" entrance for a
 * column of sections. Each direct child rises + fades in on mount, staggered.
 *
 * Screenshot- and SSR-safe: animates on MOUNT (not scroll), so content is never
 * trapped below the fold at opacity 0. Honors prefers-reduced-motion (renders a
 * plain container, no animation). Client leaf only — the page shell stays a
 * server component; `children` are server-rendered and passed through.
 *
 * Design System V2 / motion-system.md: transform+opacity only, tween on the
 * locked ease-out curve (no bounce — overshoot is off-system).
 */
export function StaggerReveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }}
    >
      {Children.map(children, (child) =>
        child == null ? child : (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {child}
          </motion.div>
        ),
      )}
    </motion.div>
  );
}
