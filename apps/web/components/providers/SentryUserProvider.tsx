"use client";

import { useUser } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

const hasClerkProvider = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Binds the signed-in Clerk user to Sentry so every captured event is
 * attributed to a user. Clears the user on sign-out and on unmount. Renders
 * nothing — mount it once inside <ClerkProvider> (see app/layout.tsx).
 */
export function SentryUserProvider() {
	if (!hasClerkProvider) {
		return null;
	}

	return <SentryUserProviderWithClerk />;
}

function SentryUserProviderWithClerk() {
	const { isLoaded, isSignedIn, user } = useUser();

	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		if (isSignedIn && user) {
			Sentry.setUser({
				id: user.id,
				email: user.primaryEmailAddress?.emailAddress,
			});
		} else {
			Sentry.setUser(null);
		}
		return () => {
			Sentry.setUser(null);
		};
	}, [isLoaded, isSignedIn, user]);

	return null;
}
