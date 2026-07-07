import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

import styles from "../../auth.module.css";
import { clerkAppearance } from "../../clerk-appearance";
import { KeylessAuthNotice, isClerkKeyless } from "../../keyless-notice";

export const metadata: Metadata = { title: "Sign in" };

interface Props {
  searchParams: Promise<{ redirect_url?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { redirect_url } = await searchParams;

  return (
    <main className={styles.authPage}>
      <div className={styles.authInner}>
        <Link href="/" className={styles.brand} aria-label="Explore and Earn — home">
          Explore<span className={styles.brandAmp}>&amp;</span>Earn
        </Link>
        <p className={styles.tagline}>Welcome back, seeker.</p>
        {isClerkKeyless() ? (
          <KeylessAuthNotice />
        ) : (
          <SignIn appearance={clerkAppearance} forceRedirectUrl={redirect_url} />
        )}
      </div>
    </main>
  );
}
