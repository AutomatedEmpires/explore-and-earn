import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Host route group — authenticated host surfaces
// (/host, /host/listings, /host/applicants, /host/offers, /host/profile, /host/analytics).
// Primary navigation is the mobile bottom nav (Home / Listings / Applicants / Analytics / More).
export default function HostLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="host">{children}</AppShell>;
}
