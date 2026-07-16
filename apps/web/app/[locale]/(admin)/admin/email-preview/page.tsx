import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Icon } from "@explore-and-earn/ui";

import { isAdminUserId } from "../../../../../lib/admin";
import { EMAIL_PREVIEWS } from "./previews";
import styles from "./email-preview.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preview",
  robots: { index: false, follow: false },
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
    <section className={styles.section}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>
          <Icon name="nav.messages" size={16} aria-hidden />
          Transactional QA
        </span>
        <h1 className={styles.heading}>Email preview</h1>
        <p className={styles.intro}>
          QA each transactional email with fixture data. Templates render exactly
          as they will in production.
        </p>
      </header>

      <ul className={styles.list}>
        {EMAIL_PREVIEWS.map((preview) => (
          <li key={preview.slug} className={styles.item}>
            <Link
              href={`/admin/email-preview/${preview.slug}`}
              className={styles.link}
            >
              <span className={styles.mark} aria-hidden="true">
                <Icon name="nav.messages" size={20} />
              </span>
              <span className={styles.body}>
                <span className={styles.label}>{preview.label}</span>
                <span className={styles.subject}>{preview.subject}</span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                <Icon name="action.forward" size={20} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
