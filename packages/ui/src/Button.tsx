import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { Icon, type IconKey } from "./icons";

/** Canonical token-driven button primitive. */
export interface ButtonProps
	extends PropsWithChildren,
		ButtonHTMLAttributes<HTMLButtonElement> {
	readonly variant?: "primary" | "secondary" | "ghost";
	readonly icon?: IconKey;
}

export function Button({
	children,
	variant = "primary",
	icon,
	type = "button",
	className,
	...rest
}: ButtonProps) {
	const classes = ["ui-button", `ui-button--${variant}`, className]
		.filter(Boolean)
		.join(" ");

	return (
		<button {...rest} type={type} className={classes}>
			{icon ? <Icon aria-hidden name={icon} size={20} /> : null}
			<span className="ui-button__label">{children}</span>
		</button>
	);
}
