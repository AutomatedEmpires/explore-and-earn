import { HostDetailSkeleton } from "../../../components/host";

/**
 * Catch-all host loading state. Shown for any (host) route segment that doesn't
 * have its own loading.tsx (dashboard, listings list, messages list, profile,
 * edit pages). The host header and bottom nav stay rendered during the transition.
 */
export default function HostLoading() {
	return <HostDetailSkeleton />;
}
