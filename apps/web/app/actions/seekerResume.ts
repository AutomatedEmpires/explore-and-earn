"use server";

import { auth } from "@clerk/nextjs/server";
import { updateSeekerProfileBio } from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";

import { reportError } from "../../lib/sentry";

export interface UpdateBioInput {
	bio?: string | null;
	headline?: string | null;
}

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Save the signed-in seeker's bio (and, once a column exists, headline).
 * Resolves the Clerk session, mints its native Supabase-integrated token, and
 * delegates the scoped write to the db package. Returns a small result object so
 * the client can surface success/failure without throwing.
 */
async function updateBioActionImpl(
	fields: UpdateBioInput,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false, error: "You must be signed in to save your resume." };
	}

	const token = await getToken();
	if (!token) {
		return { ok: false, error: "You must be signed in to save your resume." };
	}

	const result = await updateSeekerProfileBio(token, userId, fields);

	if (result.ok) {
		revalidatePath("/resume");
		revalidatePath("/profile");
	}

	return result;
}

export async function updateBioAction(
	fields: UpdateBioInput,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await updateBioActionImpl(fields);
	} catch (error) {
		reportError(error, {
			action: "updateBioAction",
			userId: await currentUserId(),
		});
		throw error;
	}
}
