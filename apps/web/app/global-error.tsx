"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

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
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang="en">
			<body
				style=
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontFamily: "system-ui, sans-serif",
					background: "#0a0a0a",
					color: "#fafafa",
				
			>
				<main style= textAlign: "center", padding: "2rem", maxWidth: "32rem" >
					<h1 style= fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" >
						Something went wrong
					</h1>
					<p style= opacity: 0.7, marginBottom: "1.5rem", lineHeight: 1.5 >
						An unexpected error occurred and our team has been notified. Please try
						reloading the page.
					</p>
					<button
						type="button"
						onClick={() => reset()}
						style=
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
						
					>
						Reload
					</button>
				</main>
			</body>
		</html>
	);
}
