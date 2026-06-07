import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { isAdminUserId } from "../../../../lib/admin";
import { EMAIL_PREVIEWS } from "./previews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preview",
  robots: { index: false, follow: false },
};

const sectionStyle: CSSProperties = { padding: "24px", maxWidth: "760px" };
const headingStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "22px",
  color: "#24221E",
};
const introStyle: CSSProperties = {
  margin: "0 0 20px",
  color: "#6E685D",
  fontSize: "14px",
};
const listStyle: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const itemStyle: CSSProperties = {
  margin: "0 0 8px",
  padding: "12px 14px",
  border: "1px solid #E7E1D3",
  borderRadius: "10px",
};
const linkStyle: CSSProperties = {
  color: "#24221E",
  fontWeight: 600,
  textDecoration: "none",
};
const subjectStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6E685D",
  fontSize: "13px",
};

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: unknown } | undefined)?.role;
  if (role !== "admin" && !isAdminUserId(userId)) {
    redirect("/");
  }
}

export default async function EmailPreviewIndexPage() {
  await requireAdmin();

  return (
    <section style={sectionStyle}>
      <h1 style={headingStyle}>Email preview</h1>
      <p style={introStyle}>
        QA each transactional email with fixture data. Templates render exactly
        as they will in production.
      </p>
      <ul style={listStyle}>
        {EMAIL_PREVIEWS.map((preview) => (
          <li key={preview.slug} style={itemStyle}>
            <Link
              href={`/admin/email-preview/${preview.slug}`}
              style={linkStyle}
            >
              {preview.label}
            </Link>
            <div style={subjectStyle}>{preview.subject}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
