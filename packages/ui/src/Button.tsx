import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { Icon, type IconKey } from "./icons";

/**
 * Button — placeholder primitive. Token-driven styling only (no hardcoded
 * colors/spacing). Real interaction states + motion tokens land with
 * Design System V1.
 */
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
	...rest
}: ButtonProps) {
	return (
		<button type={type} className={`ui-button ui-button--${variant}`} {...rest}>
			{icon ? <Icon aria-hidden name={icon} size={20} /> : null}
			<span className="ui-button__label">{children}</span>
		</button>
	);
}
