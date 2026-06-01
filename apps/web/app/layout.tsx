import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/primitives.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
