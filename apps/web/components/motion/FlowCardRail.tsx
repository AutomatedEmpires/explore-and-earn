"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface FlowCardRailProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly trackClassName?: string;
	readonly labelledBy?: string;
}

export function FlowCardRail({
	children,
	className,
	trackClassName,
	labelledBy,
}: FlowCardRailProps) {
	const ref = useRef<HTMLDivElement>(null);
	const { shouldReduceMotion } = useReducedMotionPreference();
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "end start"],
	});
	const x = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? ["0%", "0%"] : ["3%", "-5%"]);

	return (
		<div ref={ref} className={`${styles.flowRail}${className ? ` ${className}` : ""}`} aria-labelledby={labelledBy}>
			<motion.div
				className={`${styles.flowRailTrack}${trackClassName ? ` ${trackClassName}` : ""}`}
				style={{ x }}
			>
				{children}
			</motion.div>
		</div>
	);
}
