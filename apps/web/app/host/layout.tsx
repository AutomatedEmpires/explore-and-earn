import type { ReactNode } from "react";

import { PublicShell } from "../../components/public/PublicShell";

/** Public host profile (/host/[id]) — the marketing chrome, NOT the host
 *  dashboard (that lives in the (host) route group with its own OS shell). */
export default function PublicHostLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
