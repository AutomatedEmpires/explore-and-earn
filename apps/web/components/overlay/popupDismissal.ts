export function popupDismissalAllowed(
	onBeforeClose?: () => boolean,
): boolean {
	return onBeforeClose?.() !== false;
}
