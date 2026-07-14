import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Icon } from "@explore-and-earn/ui";

import styles from "../../auth.module.css";
import { clerkAppearance } from "../../clerk-appearance";
import { KeylessAuthNotice, isClerkKeyless } from "../../keyless-notice";
import { AuthRoleTabs } from "../../AuthRoleTabs";

export const metadata: Metadata = { title: "Join" };

interface Props {
  searchParams: Promise<{ redirect_url?: string; role?: string }>;
}

type JoinRole = "seeker" | "host";

/** Where each path lands after creating an account (deep links override). */
const DEFAULT_REDIRECT: Record<JoinRole, string> = {
  seeker: "/onboarding",
  host: "/host/onboarding",
};

const TAGLINE: Record<JoinRole, string> = {
  seeker: "Free forever for seekers. Housing, meals, and pay — upfront.",
  host: "List your farm, boat, or business and meet great seekers.",
};

export default async function SignUpPage({ searchParams }: Props) {
  const { redirect_url, role: roleParam } = await searchParams;
  const role: JoinRole = roleParam === "host" ? "host" : "seeker";

  // Route intent only — Clerk wiring is untouched; seekers land in onboarding,
  // hosts in the host onboarding flow, and "already have an account" keeps role.
  const redirectTo = redirect_url ?? DEFAULT_REDIRECT[role];
  const signInUrl = `/sign-in?role=${role}`;

  return (
    <main className={styles.authPage}>
      <div className={styles.authInner}>
        <Link href="/" className={styles.brand} aria-label="Explore and Earn — home">
          Explore<span className={styles.brandAmp}>&amp;</span>Earn
        </Link>

        <AuthRoleTabs mode="sign-up" active={role} redirectUrl={redirect_url} />

        <p className={styles.tagline}>{TAGLINE[role]}</p>

        {role === "seeker" ? (
          <span className={styles.freeBadge}>
            <Icon name="system.success" size={14} aria-hidden />
            Free forever · built by seekers, for seekers
          </span>
        ) : null}

        {isClerkKeyless() ? (
          <KeylessAuthNotice />
        ) : (
          <SignUp
            appearance={clerkAppearance}
            forceRedirectUrl={redirectTo}
            signInUrl={signInUrl}
          />
        )}

        <div className={styles.altActions}>
          <Link className={styles.altLink} href={signInUrl}>
            Already have an account? Sign in
          </Link>
          <Link className={styles.adminLink} href="/sign-in?role=admin">
            Become an admin
          </Link>
        </div>
      </div>
    </main>
  );
}
