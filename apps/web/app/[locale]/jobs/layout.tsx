import type { ReactNode } from "react";

import { PublicShell } from "../../../components/public/PublicShell";

/** /jobs hub + category landing pages share the public marketing chrome. */
export default function JobsLayout({ children }: { children: ReactNode }) {
	return <PublicShell>{children}</PublicShell>;
}
