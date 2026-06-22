import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AdminShell } from "../../components/admin";
import { isAdminUserId } from "../../lib/admin";
import "../../styles/admin-os.css";

export const metadata: Metadata = {
  title: {
    default: "Admin · Explore & Earn",
    template: "%s · Admin · Explore & Earn",
  },
  description:
    "Founder operations center — moderate listings, verify hosts, and monitor marketplace health.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  // FOUNDER GATE (belt-and-suspenders with Clerk middleware): only the
  // hard-coded ADMIN_CLERK_USER_ID may reach any admin surface. Anyone else —
  // signed in or not — is bounced home.
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    redirect("/");
  }

  // Admin OS — dark-glass emerald moderation command center. The .admin-os token
  // cascade flips the scope; AdminShell owns the chrome (and links the REAL admin
  // routes — the legacy AdminSidebar linked broken /admin/* paths).
  return (
    <div className="admin-os">
      <AdminShell adminName="Founder" healthScore={100}>
        {children}
      </AdminShell>
    </div>
  );
}
