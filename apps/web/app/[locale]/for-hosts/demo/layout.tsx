import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HostDemoShell } from "../../../../components/demo/full-fidelity/host/HostDemoShell";
import { HostDemoSessionProvider } from "../../../../components/demo/full-fidelity/host/HostDemoSession";
import "../../../../styles/host.css";
import "../../../../styles/host-os.css";

export const metadata: Metadata = {
  title: {
    default: "Host walkthrough · Explore & Earn",
    template: "%s · Host walkthrough · Explore & Earn",
  },
  description:
    "Walk a populated, production-shaped host workspace with fictional sample records and session-local interactions.",
  alternates: { canonical: "/for-hosts/demo" },
  robots: { index: false, follow: true },
};

/**
 * The public walkthrough uses the canonical host shell and information
 * architecture, with every authenticated destination mapped back into the
 * isolated demo namespace. No auth, database, billing, email, or provider code
 * is imported by this route tree.
 */
export default function HostDemoLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="host-os">
      <HostDemoSessionProvider>
        <HostDemoShell>{children}</HostDemoShell>
      </HostDemoSessionProvider>
    </div>
  );
}
