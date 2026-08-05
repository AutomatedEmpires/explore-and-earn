import type { ReactNode } from "react";

import { PublicShell } from "../../../../components/public/PublicShell";

export default function ForSeekersLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
