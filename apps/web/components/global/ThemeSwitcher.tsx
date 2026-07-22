"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import {
	DEFAULT_THEME_PREF,
	applyThemePref,
	persistThemePref,
	readStoredThemePref,
	type ThemePref,
} from "../../lib/theme";
import styles from "./ThemeSwitcher.module.css";

/**
 * Theme switcher — Light / Dark / System (founder 2026-07-22).
 *
 * Mounted near the top of every chrome: GlobalHeader (public), SeekerShell,
 * HostShell and AdminShell top bars. A compact segmented radiogroup that flips
 * the token axis only — all theming stays CSS-custom-property re-valuation in
 * tokens.css; this control adds no colors of its own.
 *
 * All storage/resolution rules live in lib/theme.ts (the contract): choosing
 * an option persists localStorage + the SSR cookie and applies the theme live.
 * While "System" is active, an OS color-scheme change re-applies immediately.
 *
 * Contexts can retint the control for their ground (e.g. the deep-sky
 * GlobalHeader bar) by overriding the `--ts-*` custom properties on a wrapper.
 */

const OPTIONS: readonly {
	readonly value: ThemePref;
	readonly icon: IconKey;
	readonly labelKey: "themeLight" | "themeDark" | "themeSystem";
}[] = [
	{ value: "light", icon: "action.theme_light", labelKey: "themeLight" },
	{ value: "dark", icon: "action.theme_dark", labelKey: "themeDark" },
	{ value: "system", icon: "action.theme_system", labelKey: "themeSystem" },
];

export function ThemeSwitcher({ className }: { className?: string }) {
	const t = useTranslations("Nav");
	// SSR + first client render use the default (matches the bootstrap's
	// unstored entry), then reconcile to the stored value after mount to avoid
	// a hydration mismatch — same pattern as Settings' AppearanceControl.
	const [pref, setPref] = useState<ThemePref>(DEFAULT_THEME_PREF);

	useEffect(() => {
		setPref(readStoredThemePref() ?? DEFAULT_THEME_PREF);
	}, []);

	// While following the device, track live OS color-scheme changes.
	useEffect(() => {
		if (pref !== "system" || typeof window.matchMedia !== "function") return;
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemePref("system");
		query.addEventListener?.("change", onChange);
		return () => query.removeEventListener?.("change", onChange);
	}, [pref]);

	const choose = (next: ThemePref) => {
		setPref(next);
		persistThemePref(next);
		applyThemePref(next);
	};

	return (
		<div
			className={className ? `${styles.group} ${className}` : styles.group}
			role="radiogroup"
			aria-label={t("themeLabel")}
		>
			{OPTIONS.map((option) => {
				const selected = pref === option.value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						data-selected={selected ? "true" : undefined}
						className={styles.option}
						title={t(option.labelKey)}
						aria-label={t(option.labelKey)}
						onClick={() => choose(option.value)}
					>
						<Icon name={option.icon} size={15} aria-hidden />
					</button>
				);
			})}
		</div>
	);
}
