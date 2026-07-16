"use client";

import { useEffect, useState } from "react";
import { Icon } from "@explore-and-earn/ui";
import * as Sentry from "@sentry/nextjs";

import { reportError } from "../../../../lib/sentry";
import styles from "../status.module.css";

export default function CommunityError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "community" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<Icon name="system.error" size={24} aria-hidden />
			<h2 className={styles.heading}>Community unavailable</h2>
			<p className={styles.message}>
				We couldn&apos;t load the community feed right now. Try again in a moment.
			</p>
			{eventId ? (
				<p className={styles.digest}>Error ID: {eventId}</p>
			) : null}
			<button type="button" className={styles.action} onClick={() => reset()}>
				Try again
			</button>
		</section>
	);
}
