import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Demo route group — isolated showcase surfaces
// (/demo, /demo/design-system, /demo/discovery-card, /demo/listing-detail,
//  /demo/seeker-dashboard, /demo/host-dashboard). Isolation marker is now
// data-scope="demo" on the shell root. Chrome only; not part of the product nav.
export default function DemoLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="demo">{children}</AppShell>;
}
