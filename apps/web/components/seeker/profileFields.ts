import type { SeekerAvailabilityStatus } from "@explore-and-earn/db";

/** Availability enum (seeker_profiles.availability_status) rendered as a select. */
export const AVAILABILITY_OPTIONS: ReadonlyArray<{
	readonly value: SeekerAvailabilityStatus;
	readonly label: string;
}> = [
	{ value: "available_now", label: "Available now" },
	{ value: "date_range", label: "Available for a date range" },
	{ value: "flexible", label: "Flexible" },
	{ value: "unavailable", label: "Unavailable" },
];

export const AVAILABILITY_LABEL: Record<SeekerAvailabilityStatus, string> =
	AVAILABILITY_OPTIONS.reduce(
		(acc, option) => {
			acc[option.value] = option.label;
			return acc;
		},
		{} as Record<SeekerAvailabilityStatus, string>,
	);
