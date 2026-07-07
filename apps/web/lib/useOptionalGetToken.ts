"use client";

import { useAuth } from "@clerk/nextjs";

type GetToken = (options?: { template?: string }) => Promise<string | null>;

// Module-level so the fallback keeps a stable identity across renders —
// consumers hold getToken in useCallback deps.
const NULL_TOKEN_GETTER: GetToken = async () => null;

/**
 * useAuth().getToken for client components that must render in environments
 * WITHOUT <ClerkProvider> (the keyless local/QA world — the root layout
 * skips the provider when no publishable key is set). Clerk's useAuth
 * throws there, which previously crashed whole forms (e.g. listing
 * creation) to the error boundary. Degrades to a null-token getter: the
 * surface renders and token-gated actions surface their existing
 * "session expired" errors instead. Production behavior is unchanged.
 *
 * The useAuth call happens unconditionally on every render (the throw is
 * synchronous and consistent per environment), so hook order is stable.
 * useAuth's only synchronous throw is the missing-<ClerkProvider> guard,
 * so the catch cannot mask a keyed-environment failure — with keys set,
 * the provider exists and useAuth never throws.
 */
export function useOptionalGetToken(): GetToken {
	try {
		const { getToken } = useAuth();
		return getToken as GetToken;
	} catch {
		return NULL_TOKEN_GETTER;
	}
}
