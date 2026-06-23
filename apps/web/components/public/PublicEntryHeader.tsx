import { GlobalHeader } from "../global";

/**
 * @deprecated Retired in favor of the single unified public header.
 *
 * There is now ONE guest header across the whole public surface (home,
 * about, legal): {@link GlobalHeader} in `scope="guest"`. This thin alias
 * stays only so any lingering import keeps rendering the canonical header —
 * it must never reintroduce a divergent wordmark/seal/scope-pill. Prefer
 * importing `GlobalHeader` directly in new code.
 */
export function PublicEntryHeader() {
	return <GlobalHeader scope="guest" isAuthenticated={false} />;
}
