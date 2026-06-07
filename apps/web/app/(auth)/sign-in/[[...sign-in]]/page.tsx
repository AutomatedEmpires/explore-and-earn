import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

import styles from "../../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

interface Props {
  searchParams: Promise<{ redirect_url?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { redirect_url } = await searchParams;

  return (
    <main className={styles.authPage}>
      <SignIn forceRedirectUrl={redirect_url} />
    </main>
  );
}
