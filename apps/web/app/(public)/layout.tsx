import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Public route group — unauthenticated content surfaces
// (/explore, /opportunities/[slug], /hosts/[slug]). Shares the global top nav.
export default function PublicLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="public">{children}</AppShell>;
}
