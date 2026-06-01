import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Seeker route group — authenticated seeker surfaces
// (/seeker, /seeker/saved, /seeker/applications, /seeker/offers, /seeker/profile).
// Primary navigation is the mobile bottom nav (LOCKED order); no auth logic here yet.
export default function SeekerLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="seeker">{children}</AppShell>;
}
