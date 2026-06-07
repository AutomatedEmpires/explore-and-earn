"use client";

import { useEffect, type CSSProperties } from "react";

// Token-only inline styles (no hardcoded colors) so the boundary works even if
// a CSS-module bundle failed to load as part of the error being handled.
const containerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "var(--space-12)",
	padding: "var(--space-section) var(--space-gutter)",
	minHeight: "60vh",
	textAlign: "center",
	background: "var(--color-paper)",
};

const headingStyle: CSSProperties = {
	margin: 0,
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-page-size)",
	lineHeight: "var(--type-page-lh)",
	color: "var(--text-primary)",
};

const messageStyle: CSSProperties = {
	margin: 0,
	maxWidth: "36ch",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	lineHeight: "var(--type-body-lh)",
	color: "var(--text-secondary)",
};

const buttonStyle: CSSProperties = {
	display: "inline-flex",
	padding: "var(--space-8) var(--space-16)",
	borderRadius: "var(--radius-button)",
	border: "1px solid var(--text-primary)",
	background: "var(--text-primary)",
	color: "var(--color-surface-raised)",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	cursor: "pointer",
};

/**
 * Error boundary for the public host profile route (host/[id]). Catches
 * render/runtime errors and offers a recovery action instead of a blank screen.
 * Client Component per the Next.js error-boundary contract.
 */
export default function HostProfileError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		// Report to Sentry if a client hub is available; no-op when absent.
		const hub = (
			globalThis as typeof globalThis & {
				__sentryHub?: { captureException: (e: unknown) => void };
			}
		).__sentryHub;
		hub?.captureException(error);
	}, [error]);

	return (
		<div role="alert" style={containerStyle}>
			<h2 style={headingStyle}>Something went wrong</h2>
			<p style={messageStyle}>
				{error.digest
					? `Error ID: ${error.digest}`
					: "An unexpected error occurred."}
			</p>
			<button type="button" onClick={() => reset()} style={buttonStyle}>
				Try again
			</button>
		</div>
	);
}
