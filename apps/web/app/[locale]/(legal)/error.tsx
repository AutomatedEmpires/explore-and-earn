"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

import { reportError } from "../../../lib/sentry";
import { StatusCard } from "../../../components/StatusCard";

export default function LegalError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "legal" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<StatusCard
			type="error"
			digest={eventId}
			onReset={reset}
			presentation="embedded"
		/>
	);
}
