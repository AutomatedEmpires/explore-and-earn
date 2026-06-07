"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState, type CSSProperties } from "react";

import { reportError } from "../lib/sentry";

const bodyStyle: CSSProperties = {
	margin: 0,
	minHeight: "100vh",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	fontFamily: "system-ui, sans-serif",
	background: "#0a0a0a",
	color: "#fafafa",
};

const mainStyle: CSSProperties = {
	textAlign: "center",
	padding: "2rem",
	maxWidth: "32rem",
};

const headingStyle: CSSProperties = {
	fontSize: "1.5rem",
	fontWeight: 600,
	marginBottom: "0.5rem",
};

const textStyle: CSSProperties = {
	opacity: 0.7,
	marginBottom: "1.5rem",
	lineHeight: 1.5,
};

const buttonStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	padding: "0.625rem 1.25rem",
	fontSize: "0.875rem",
	fontWeight: 600,
	color: "#0a0a0a",
	background: "#fafafa",
	border: "none",
	borderRadius: "9999px",
	cursor: "pointer",
};

const idStyle: CSSProperties = {
	opacity: 0.5,
	fontSize: "0.75rem",
	marginTop: "1rem",
};

/**
 * App Router global error boundary. Required by Next.js to catch errors thrown
 * in the root layout; it replaces the layout, so it must render its own
 * <html>/<body>. Reports the error to Sentry on mount.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "global" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<html lang="en">
			<body style={bodyStyle}>
				<main style={mainStyle}>
					<h1 style={headingStyle}>Something went wrong</h1>
					<p style={textStyle}>
						An unexpected error occurred and our team has been notified. Please try
						reloading the page.
					</p>
					<button type="button" onClick={() => reset()} style={buttonStyle}>
						Reload
					</button>
					{eventId ? (
						<p style={idStyle}>
							Error ID: {eventId} — quote this if contacting support
						</p>
					) : null}
				</main>
			</body>
		</html>
	);
}
