"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export function RouteTransitionShell({ children }: { readonly children: ReactNode }) {
	const pathname = usePathname();
	const { shouldReduceMotion } = useReducedMotionPreference();

	if (shouldReduceMotion) {
		return <div className={styles.routeShell}>{children}</div>;
	}

	return (
		<AnimatePresence mode="wait" initial={false}>
			<motion.div
				key={pathname}
				className={styles.routeShell}
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -6 }}
				transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}
