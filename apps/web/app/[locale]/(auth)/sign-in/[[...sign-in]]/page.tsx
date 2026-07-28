import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { Icon } from "@explore-and-earn/ui";

import { resolveReturnPath } from "../../../../../lib/authRedirect";
import { isCommunityPath } from "../../../../../lib/communityRoutes";
import { CaptureOnMount } from "../../../../../components/analytics/CaptureOnMount";
import { PUBLIC_IA_EVENTS } from "../../../../../lib/analytics";
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
  searchParams: Promise<{
    redirect_url?: string;
    /** Spec-named return path (D18). Same validator, newer name. */
    returnTo?: string;
    role?: string;
  }>;
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
  const { redirect_url, returnTo, role: roleParam } = await searchParams;
  const role: AuthRole =
    roleParam === "host" ? "host" : roleParam === "admin" ? "admin" : "seeker";

  // Route intent only — Clerk wiring is untouched; we just pass where to land
  // and where its "create account" link should go, carrying the chosen role.
  //
  // VALIDATED HERE TOO, not only in the middleware. The middleware scrub is the
  // outer wall, but this page is also reachable from an in-app <Link>, from a
  // rewrite, and from anything that bypasses the matcher — and the value ends
  // up in Clerk's forceRedirectUrl, which accepts ABSOLUTE URLs. A single
  // unvalidated hop is an open redirect, so the check lives at the point of use.
  const safeRedirectUrl = resolveReturnPath({ returnTo, redirect_url });
  const suppliedReturn = returnTo ?? redirect_url;
  if (suppliedReturn !== undefined && !safeRedirectUrl) {
    redirect(
      role === "admin"
        ? "/sign-in?role=admin"
        : authRoleHref("sign-in", role),
    );
  }
  const redirectTo = safeRedirectUrl ?? DEFAULT_REDIRECT[role];
  // D18 funnel signal: a seeker who arrived here because Community is an
  // authenticated space. Fired from the sign-in page rather than the middleware
  // because middleware has no analytics client — and because what matters is
  // that the visitor SAW the seeker sign-in, not that a 307 was written.
  const cameFromCommunity =
    safeRedirectUrl !== undefined && isCommunityPath(safeRedirectUrl.split("?")[0] ?? "");
  const signUpUrl =
    role === "admin"
      ? "/sign-up"
      : authRoleHref("sign-up", role, safeRedirectUrl);

  return (
    <main className={styles.authPage}>
      {cameFromCommunity ? (
        <CaptureOnMount event={PUBLIC_IA_EVENTS.communityAuthRedirected} />
      ) : null}
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

        <p className={styles.tagline}>
          {cameFromCommunity && role === "seeker"
            ? "Community is a seeker space — sign in to read and post."
            : TAGLINE[role]}
        </p>

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
