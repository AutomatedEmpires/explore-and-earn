"use client";

import type { CSSProperties } from "react";

import styles from "./motion.module.css";

export interface RippleFieldProps {
	readonly className?: string;
	readonly particleCount?: number;
}

export function RippleField({ className, particleCount = 18 }: RippleFieldProps) {
	return (
		<div className={`${styles.rippleField}${className ? ` ${className}` : ""}`} aria-hidden="true">
			<span className={styles.rippleCore} />
			<span className={styles.rippleRing} data-ring="1" />
			<span className={styles.rippleRing} data-ring="2" />
			<span className={styles.rippleRing} data-ring="3" />
			{Array.from({ length: particleCount }, (_, index) => {
				const angle = (index / particleCount) * Math.PI * 2;
				const radius = 32 + (index % 6) * 11;
				const x = 50 + Math.cos(angle) * radius;
				const y = 50 + Math.sin(angle) * radius * 0.62;
				const size = 3 + (index % 4);

				return (
					<span
						key={index}
						className={styles.rippleParticle}
						style={{
							"--particle-x": `${x}%`,
							"--particle-y": `${y}%`,
							"--particle-size": `${size}px`,
							"--particle-delay": `${120 + index * 28}ms`,
						} as CSSProperties}
					/>
				);
			})}
		</div>
	);
}
