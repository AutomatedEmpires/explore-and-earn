"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";

export interface MotionSectionProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly id?: string;
	readonly labelledBy?: string;
	readonly delay?: number;
	readonly amount?: number;
}

export function MotionSection({
	children,
	className,
	id,
	labelledBy,
	delay = 0,
	amount = 0.24,
}: MotionSectionProps) {
	const { shouldReduceMotion } = useReducedMotionPreference();

	if (shouldReduceMotion) {
		return (
			<section id={id} className={className} aria-labelledby={labelledBy}>
				{children}
			</section>
		);
	}

	return (
		<motion.section
			id={id}
			className={className}
			aria-labelledby={labelledBy}
			initial={{ opacity: 0, y: 18 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount }}
			transition={{ duration: 0.42, delay, ease: [0.2, 0.8, 0.2, 1] }}
		>
			{children}
		</motion.section>
	);
}
