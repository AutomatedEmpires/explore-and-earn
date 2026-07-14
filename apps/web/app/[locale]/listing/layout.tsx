import type { ReactNode } from "react";

import { PublicShell } from "../../../components/public/PublicShell";

export default function ListingLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
