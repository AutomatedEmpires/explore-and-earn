"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface ScrollSceneProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly id?: string;
	readonly labelledBy?: string;
}

export function ScrollScene({
	children,
	className,
	id,
	labelledBy,
}: ScrollSceneProps) {
	const ref = useRef<HTMLElement>(null);
	const { shouldReduceMotion } = useReducedMotionPreference();
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start end", "end start"],
	});
	const y = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [0, 0] : [24, -24]);
	const opacity = useTransform(scrollYProgress, [0, 0.12, 0.88, 1], shouldReduceMotion ? [1, 1, 1, 1] : [0.78, 1, 1, 0.86]);

	return (
		<motion.section
			ref={ref}
			id={id}
			className={`${styles.scrollScene}${className ? ` ${className}` : ""}`}
			aria-labelledby={labelledBy}
			style={{ y, opacity }}
		>
			{children}
		</motion.section>
	);
}
