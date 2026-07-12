import { auth } from "@clerk/nextjs/server";

/**
 * auth() for PUBLIC pages: a failed auth read is a guest, never a crashed
 * page.
 *
 * Clerk's auth() throws when clerkMiddleware didn't run this request — which
 * is every request in the keyless local/e2e harness (the fallback middleware
 * runs instead). Public surfaces must render for that world exactly as they
 * do for signed-out production visitors, so auth enrichment (fit scores,
 * saved state, review eligibility) degrades to guest instead of aborting the
 * page stream. Protected routes keep using auth() directly — failing loudly
 * is correct there.
 */
export async function optionalAuth(): Promise<{
	userId: string | null;
	getToken: (() => Promise<string | null>) | null;
}> {
	try {
		const { userId, getToken } = await auth();
		return { userId, getToken };
	} catch {
		return { userId: null, getToken: null };
	}
}
