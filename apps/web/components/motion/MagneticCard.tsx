"use client";

import type { PointerEvent, ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface MagneticCardProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly strength?: number;
}

export function MagneticCard({
	children,
	className,
	strength = 10,
}: MagneticCardProps) {
	const { shouldReduceMotion } = useReducedMotionPreference();
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const smoothX = useSpring(x, { stiffness: 260, damping: 42, mass: 0.55 });
	const smoothY = useSpring(y, { stiffness: 260, damping: 42, mass: 0.55 });

	function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
		if (shouldReduceMotion || event.pointerType === "touch") {
			return;
		}

		const rect = event.currentTarget.getBoundingClientRect();
		const nextX = ((event.clientX - rect.left) / rect.width - 0.5) * strength;
		const nextY = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
		x.set(nextX);
		y.set(nextY);
	}

	function handlePointerLeave() {
		x.set(0);
		y.set(0);
	}

	return (
		<motion.div
			className={`${styles.magneticCard}${className ? ` ${className}` : ""}`}
			style={shouldReduceMotion ? undefined : { x: smoothX, y: smoothY }}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
		>
			{children}
		</motion.div>
	);
}
