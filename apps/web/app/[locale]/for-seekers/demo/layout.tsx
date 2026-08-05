import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DemoSeekerShell } from "../../../../components/demo/full-fidelity/seeker/DemoSeekerShell";
import "../../../../styles/seeker-os.css";

export const metadata: Metadata = {
  title: "Seeker walkthrough · Explore & Earn",
  description: "Walk a populated Explore & Earn seeker account using isolated sample data.",
  alternates: { canonical: "/for-seekers/demo" },
  robots: { index: false, follow: true },
};

export default function SeekerDemoLayout({ children }: { readonly children: ReactNode }) {
  return <DemoSeekerShell>{children}</DemoSeekerShell>;
}
