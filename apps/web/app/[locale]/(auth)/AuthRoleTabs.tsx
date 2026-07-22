import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { safeInternalRedirect } from "../../../lib/authRedirect";
import styles from "./auth.module.css";

/** The two self-serve entry paths. Admin is a separate quiet affordance. */
export type AuthRole = "seeker" | "host" | "admin";

interface Props {
  /** Which auth page these tabs live on — controls the destination route. */
  readonly mode: "sign-in" | "sign-up";
  /** Currently selected path. */
  readonly active: Exclude<AuthRole, "admin">;
  /** Deep-link return target to carry through the role switch, if any. */
  readonly redirectUrl?: string;
}

export function authRoleHref(
  mode: Props["mode"],
  role: Exclude<AuthRole, "admin">,
  redirectUrl?: string,
): string {
  const params = new URLSearchParams({ role });
  const safeRedirectUrl = safeInternalRedirect(redirectUrl);
  if (safeRedirectUrl) params.set("redirect_url", safeRedirectUrl);
  return `/${mode}?${params.toString()}`;
}

/**
 * Seeker vs host chooser shown up front on both auth pages. Pure links (no
 * client JS) so the distinction is clear before the Clerk widget mounts and
 * the chosen role drives the post-auth route (seeker → seek/onboarding,
 * host → host flow).
 */
export function AuthRoleTabs({ mode, active, redirectUrl }: Props) {
  return (
    <div className={styles.roleTabs} role="tablist" aria-label="Choose your path">
      <Link
        role="tab"
        aria-selected={active === "seeker"}
        className={`${styles.roleTab}${active === "seeker" ? ` ${styles.roleTabActive}` : ""}`}
        href={authRoleHref(mode, "seeker", redirectUrl)}
      >
        <Icon name="nav.seek" size={18} aria-hidden />
        I&rsquo;m a seeker
      </Link>
      <Link
        role="tab"
        aria-selected={active === "host"}
        className={`${styles.roleTab}${active === "host" ? ` ${styles.roleTabActive}` : ""}`}
        href={authRoleHref(mode, "host", redirectUrl)}
      >
        <Icon name="nav.host" size={18} aria-hidden />
        I&rsquo;m a host
      </Link>
    </div>
  );
}
