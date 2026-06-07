import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { isAdminUserId } from "../../../../../lib/admin";
import { getEmailPreview } from "../previews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preview",
  robots: { index: false, follow: false },
};

const sectionStyle: CSSProperties = { padding: "16px" };
const backLinkStyle: CSSProperties = {
  color: "#6E685D",
  fontSize: "13px",
  textDecoration: "none",
};
const headingStyle: CSSProperties = {
  margin: "8px 0 4px",
  fontSize: "18px",
  color: "#24221E",
};
const subjectStyle: CSSProperties = {
  margin: "0 0 16px",
  color: "#6E685D",
  fontSize: "13px",
};
const frameStyle: CSSProperties = {
  width: "100%",
  height: "80vh",
  border: "1px solid #E7E1D3",
  borderRadius: "12px",
  backgroundColor: "#FFFFFF",
};

export default async function EmailTemplatePreviewPage({
  params,
}: {
  readonly params: Promise<{ template: string }>;
}) {
  const { userId } = await auth();
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: unknown } | undefined)?.role;
  if (role !== "admin" && !isAdminUserId(userId)) {
    redirect("/");
  }

  const { template } = await params;
  const preview = getEmailPreview(template);
  if (!preview) {
    notFound();
  }

  const html = preview.render();

  return (
    <section style={sectionStyle}>
      <Link href="/admin/email-preview" style={backLinkStyle}>
        ← All templates
      </Link>
      <h1 style={headingStyle}>{preview.label}</h1>
      <p style={subjectStyle}>Subject: {preview.subject}</p>
      <iframe title={preview.label} srcDoc={html} style={frameStyle} />
    </section>
  );
}
