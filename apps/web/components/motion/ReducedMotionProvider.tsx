"use client";

import {
	createContext,
	useEffect,
	useContext,
	useState,
	type ReactNode,
} from "react";
import { MotionConfig, useReducedMotion as useSystemReducedMotion } from "motion/react";

interface ReducedMotionContextValue {
	readonly shouldReduceMotion: boolean;
}

const ReducedMotionContext = createContext<ReducedMotionContextValue>({
	shouldReduceMotion: false,
});

export function ReducedMotionProvider({ children }: { readonly children: ReactNode }) {
	const systemPreference = useSystemReducedMotion();
	const [hydrated, setHydrated] = useState(false);
	const shouldReduceMotion = hydrated ? systemPreference ?? false : false;

	useEffect(() => {
		setHydrated(true);
	}, []);

	return (
		<ReducedMotionContext.Provider value={{ shouldReduceMotion }}>
			<MotionConfig
				reducedMotion={shouldReduceMotion ? "always" : "never"}
				transition={{
					duration: 0.2,
					ease: [0.2, 0.8, 0.2, 1],
				}}
			>
				{children}
			</MotionConfig>
		</ReducedMotionContext.Provider>
	);
}

export function useReducedMotionPreference() {
	return useContext(ReducedMotionContext);
}
