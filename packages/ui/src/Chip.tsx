import type { PropsWithChildren } from "react";
import { Icon, type IconKey } from "./icons";

/**
 * Chip — placeholder primitive for filters / tags. Token-driven styling only.
 */
export interface ChipProps extends PropsWithChildren {
	readonly icon?: IconKey;
	readonly selected?: boolean;
}

export function Chip({ children, icon, selected = false }: ChipProps) {
	return (
		<span
			className={`ui-chip${selected ? " ui-chip--selected" : ""}`}
			aria-pressed={selected}
		>
			{icon ? <Icon aria-hidden name={icon} size={16} /> : null}
			<span className="ui-chip__label">{children}</span>
		</span>
	);
}
