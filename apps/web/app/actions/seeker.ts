"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
	upsertSeekerProfile,
	type SeekerAvailabilityStatus,
	type SeekerProfileInput,
} from "@explore-and-earn/db";

export type UpdateProfileResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string };

export type UpdateProfileAction = (
	formData: FormData,
) => Promise<UpdateProfileResult>;

const AVAILABILITY_VALUES: ReadonlySet<SeekerAvailabilityStatus> = new Set([
	"available_now",
	"date_range",
	"flexible",
	"unavailable",
]);

function readString(formData: FormData, key: string): string | undefined {
	const value = formData.get(key);
	return typeof value === "string" ? value : undefined;
}

function parseAvailability(
	value: string | undefined,
): SeekerAvailabilityStatus | null | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === "") {
		return null;
	}
	return AVAILABILITY_VALUES.has(value as SeekerAvailabilityStatus)
		? (value as SeekerAvailabilityStatus)
		: undefined;
}

function parseSkills(value: string | undefined): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/**
 * Server action: persist the seeker's own profile edits.
 *
 * Auth: reads the Clerk session (auth()) and forwards the session JWT to
 * authedClient (anon key + Bearer) inside the db query layer. RLS is not yet
 * active, so the db layer additionally scopes every write by the JWT `sub`
 * (clerk_user_id). The service-role client is reserved for the webhook only.
 *
 * PostHog: the `profile_updated` event is emitted client-side in ProfileEditor
 * after this action resolves successfully (posthog-js is browser-only).
 */
export async function updateProfile(
	formData: FormData,
): Promise<UpdateProfileResult> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return {
			ok: false,
			error: "You must be signed in to update your profile.",
		};
	}

	const token = await getToken();
	if (!token) {
		return {
			ok: false,
			error: "Your session has expired. Please sign in again.",
		};
	}

	const availability = parseAvailability(
		readString(formData, "availability_status"),
	);
	const start = readString(formData, "availability_start");
	const end = readString(formData, "availability_end");
	const isDateRange = availability === "date_range";

	const input: SeekerProfileInput = {
		displayName: readString(formData, "display_name"),
		shortBio: readString(formData, "short_bio"),
		skills: parseSkills(readString(formData, "skills")),
		availabilityStatus: availability,
		// Only persist range bounds when a date_range availability is selected.
		availabilityStart: isDateRange ? (start ? start : null) : null,
		availabilityEnd: isDateRange ? (end ? end : null) : null,
	};

	try {
		await upsertSeekerProfile(token, input);
	} catch (error) {
		console.error("updateProfile failed", error);
		return {
			ok: false,
			error: "We couldn't save your profile. Please try again.",
		};
	}

	revalidatePath("/profile");
	revalidatePath("/resume");
	return { ok: true };
}
