"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface LiquidGlassPanelProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly tone?: "clear" | "deep" | "frost";
	readonly delay?: number;
}

export function LiquidGlassPanel({
	children,
	className,
	tone = "clear",
	delay = 0,
}: LiquidGlassPanelProps) {
	const { shouldReduceMotion } = useReducedMotionPreference();
	const panelClassName = `${styles.liquidGlassPanel} ${styles[`liquidGlassPanel_${tone}`]}${className ? ` ${className}` : ""}`;

	if (shouldReduceMotion) {
		return <div className={panelClassName}>{children}</div>;
	}

	return (
		<motion.div
			className={panelClassName}
			initial={{ opacity: 0, y: 16, scale: 0.985 }}
			whileInView={{ opacity: 1, y: 0, scale: 1 }}
			viewport={{ once: true, amount: 0.35 }}
			transition={{ duration: 0.38, delay, ease: [0.2, 0.8, 0.2, 1] }}
		>
			{children}
		</motion.div>
	);
}
