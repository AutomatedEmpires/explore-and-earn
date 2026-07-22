import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Icon } from "@explore-and-earn/ui";

import { safeInternalRedirect } from "../../../../../lib/authRedirect";
import styles from "../../auth.module.css";
import { clerkAppearance } from "../../clerk-appearance";
import { KeylessAuthNotice, isClerkKeyless } from "../../keyless-notice";
import {
  AuthRoleTabs,
  authRoleHref,
  type AuthRole,
} from "../../AuthRoleTabs";

export const metadata: Metadata = { title: "Sign in" };

interface Props {
  searchParams: Promise<{ redirect_url?: string; role?: string }>;
}

/** Where each path lands after a successful sign-in (deep links override). */
const DEFAULT_REDIRECT: Record<AuthRole, string> = {
  seeker: "/seek",
  host: "/host",
  admin: "/admin",
};

const TAGLINE: Record<AuthRole, string> = {
  seeker: "Welcome back, seeker.",
  host: "Welcome back — manage your listings and applicants.",
  admin: "Platform access for administrators.",
};

export default async function SignInPage({ searchParams }: Props) {
  const { redirect_url, role: roleParam } = await searchParams;
  const role: AuthRole =
    roleParam === "host" ? "host" : roleParam === "admin" ? "admin" : "seeker";

  // Route intent only — Clerk wiring is untouched; we just pass where to land
  // and where its "create account" link should go, carrying the chosen role.
  const safeRedirectUrl = safeInternalRedirect(redirect_url);
  const redirectTo = safeRedirectUrl ?? DEFAULT_REDIRECT[role];
  const signUpUrl =
    role === "admin"
      ? "/sign-up"
      : authRoleHref("sign-up", role, safeRedirectUrl);

  return (
    <main className={styles.authPage}>
      <div className={styles.authInner}>
        <Link href="/" className={styles.brand} aria-label="Explore and Earn — home">
          Explore<span className={styles.brandAmp}>&amp;</span>Earn
        </Link>

        {role === "admin" ? (
          <span className={styles.adminEyebrow}>
            <Icon name="nav.admin" size={14} aria-hidden />
            Admin access
          </span>
        ) : (
          <AuthRoleTabs mode="sign-in" active={role} redirectUrl={safeRedirectUrl} />
        )}

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
          <SignIn
            appearance={clerkAppearance}
            forceRedirectUrl={redirectTo}
            signUpUrl={signUpUrl}
          />
        )}

        <div className={styles.altActions}>
          {role === "admin" ? (
            <Link className={styles.altLink} href="/sign-in?role=seeker">
              ← Seeker &amp; host sign-in
            </Link>
          ) : (
            <>
              <Link className={styles.altLink} href={signUpUrl}>
                New here? Create an account
              </Link>
              <Link className={styles.adminLink} href="/sign-in?role=admin">
                Become an admin
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
