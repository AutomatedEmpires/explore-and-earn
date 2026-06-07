import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Button, Icon } from "@explore-and-earn/ui";

import styles from "./AdminHeader.module.css";

/**
 * Admin top bar: brand mark + "Admin" scope label on the left, sign-out on the
 * right. Server component — Clerk's SignOutButton is itself a client component
 * and wraps our Button to trigger sign-out.
 */
export function AdminHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/admin">
        <Icon name="nav.admin" size={24} aria-hidden />
        <span className={styles.wordmark}>Explore &amp; Earn</span>
        <span className={styles.scope}>Admin</span>
      </Link>
      <SignOutButton>
        <Button variant="secondary">Sign out</Button>
      </SignOutButton>
    </header>
  );
}
