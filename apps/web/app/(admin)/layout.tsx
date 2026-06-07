import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AdminHeader, AdminSidebar } from "../../components/admin";
import { isAdminUserId } from "../../lib/admin";
import styles from "./layout.module.css";

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

  return (
    <div className={styles.shell}>
      <AdminHeader />
      <div className={styles.body}>
        <AdminSidebar />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
