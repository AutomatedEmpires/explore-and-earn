import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Community route group — light V1 surface (/community). Brand-only header;
// intentionally NOT in the seeker bottom nav (A-FE-SEEKER-NAV-ORDER). Chrome only.
export default function CommunityLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="community">{children}</AppShell>;
}
