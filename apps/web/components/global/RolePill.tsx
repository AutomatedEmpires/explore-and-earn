import styles from "./RolePill.module.css";

/**
 * RolePill — the one piece of chrome that answers "who am I signed in as?".
 *
 * D17 (redesign V2): a role pill sits beside the wordmark on AUTHENTICATED
 * chrome, and NOWHERE signed-out. The problem it solves is concrete: this
 * product gives one human three different products under one domain — the same
 * person can be a seeker on /seek and a host on /host, and admins share the
 * shell with both. Before this, the only way to tell which product you were
 * looking at was to recognise the page. A signed-out visitor, by contrast, has
 * no role at all, so a pill there would be inventing state — hence no pill.
 *
 * NEVER COLOR-ONLY. Each variant carries its own semantic colour AND its
 * literal text label; the colour is redundant reinforcement, so the pill still
 * works at 1-bit, in high-contrast mode, and for anyone who cannot separate
 * teal from green. The colours follow the D22 register:
 *
 *   Seeker  lake-teal    the action colour — the seeker is the one acting
 *   Host    alpine green place/employer identity
 *   Admin   ink          operator chrome; deliberately the quietest
 *
 * Server component on purpose: it renders identical markup every time and holds
 * no state, so it costs a shell nothing to include.
 */

export type ChromeRole = "seeker" | "host" | "admin";

const LABELS: Record<ChromeRole, string> = {
  seeker: "Seeker",
  host: "Host",
  admin: "Admin",
};

/** Which ground the pill sits on. The marketing header is a dark brand band. */
export type RolePillTone = "surface" | "onDark";

export interface RolePillProps {
  readonly role: ChromeRole;
  /** Ground the pill renders against. Defaults to the light workspace surface. */
  readonly tone?: RolePillTone;
  /**
   * Whether the viewer is signed in. Defaults to `true` because the shells that
   * render this are already behind auth; the public header passes its real
   * value. When false NOTHING renders — the caller does not have to branch.
   */
  readonly isAuthenticated?: boolean;
  /** Extra class from the host shell, for layout only (never colour). */
  readonly className?: string;
}

export function RolePill({
  role,
  tone = "surface",
  isAuthenticated = true,
  className,
}: RolePillProps) {
  if (!isAuthenticated) {
    return null;
  }
  const label = LABELS[role];
  return (
    <span
      className={`${styles.pill}${className ? ` ${className}` : ""}`}
      data-role={role}
      data-tone={tone}
      // The visible text already says "Host"; the aria-label spells out what
      // that word MEANS here so a screen reader doesn't announce a bare noun
      // floating next to the wordmark.
      aria-label={`Signed in as ${label}`}
    >
      {label}
    </span>
  );
}
