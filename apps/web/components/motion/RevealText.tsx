"use client";

import { motion } from "motion/react";

import { useReducedMotionPreference } from "./ReducedMotionProvider";
import styles from "./motion.module.css";

export interface RevealTextProps {
	readonly text: string;
	readonly className?: string;
	readonly wordClassName?: string;
	readonly delay?: number;
}

export function RevealText({
	text,
	className,
	wordClassName,
	delay = 0,
}: RevealTextProps) {
	const { shouldReduceMotion } = useReducedMotionPreference();
	const words = text.split(" ");

	if (shouldReduceMotion) {
		return <span className={className}>{text}</span>;
	}

	return (
		<span className={`${styles.revealText}${className ? ` ${className}` : ""}`} aria-label={text}>
			{words.map((word, index) => (
				<motion.span
					key={`${word}-${index}`}
					className={`${styles.revealWord}${wordClassName ? ` ${wordClassName}` : ""}`}
					aria-hidden="true"
					initial={{ opacity: 0, y: "0.55em" }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{
						duration: 0.36,
						delay: delay + Math.min(index, 10) * 0.035,
						ease: [0.2, 0.8, 0.2, 1],
					}}
				>
					{word}
					{index < words.length - 1 ? "\u00A0" : null}
				</motion.span>
			))}
		</span>
	);
}
