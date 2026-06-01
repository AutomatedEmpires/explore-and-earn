import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Marketing route group — logged-out brand surfaces (/, /about, /how-it-works, /pricing).
// Chrome only; the AppShell renders the global top navigation for this scope.
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="marketing">{children}</AppShell>;
}
