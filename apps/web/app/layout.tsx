import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/components.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
