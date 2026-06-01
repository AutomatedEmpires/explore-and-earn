import type { ReactNode } from "react";

import { AppShell } from "../../components/shell/AppShell";

// Admin route group — internal console (/admin). Brand-only header in V1;
// sub-queues are deferred (registered, no V1 slug). Chrome only.
export default function AdminLayout({ children }: { children: ReactNode }) {
	return <AppShell scope="admin">{children}</AppShell>;
}
