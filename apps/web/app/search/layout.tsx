import type { ReactNode } from "react";

import { PublicShell } from "../../components/public/PublicShell";
import "../../components/search/search.css";

export default function SearchLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
