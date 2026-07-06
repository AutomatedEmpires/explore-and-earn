"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface FloatingMapPin {
	readonly label: string;
	readonly category: OpportunityCategory;
	readonly x: number;
	readonly y: number;
	readonly value?: string;
}

export function FloatingMapPins({
	pins,
	className,
}: {
	readonly pins: readonly FloatingMapPin[];
	readonly className?: string;
}) {
	const { shouldReduceMotion } = useReducedMotionPreference();

	return (
		<div className={`${styles.pinField}${className ? ` ${className}` : ""}`} aria-label="Opportunity locations">
			{pins.map((pin, index) => (
				<motion.div
					key={`${pin.label}-${index}`}
					className={`${styles.mapPin} ${styles[`mapPin_${pin.category}`]}`}
					style={{ "--pin-x": `${pin.x}%`, "--pin-y": `${pin.y}%` } as CSSProperties}
					initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.86, y: 8 }}
					whileInView={shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
					viewport={{ once: true, amount: 0.5 }}
					transition={{ duration: 0.28, delay: index * 0.045, ease: [0.2, 0.8, 0.2, 1] }}
				>
					<Icon name={`mappin.${pin.category}`} size={16} aria-hidden />
					<span className={styles.mapPinText}>
						<span>{pin.label}</span>
						{pin.value ? <strong>{pin.value}</strong> : null}
					</span>
				</motion.div>
			))}
		</div>
	);
}
