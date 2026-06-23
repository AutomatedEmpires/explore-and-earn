import type { ReactNode } from "react";

/**
 * Per-navigation view-enter for the Admin OS.
 *
 * Unlike layout.tsx (which persists the shell), template.tsx re-mounts on every
 * route change within the (admin) segment — so the `.adminos-view` wrapper
 * replays its settle-in animation each time the moderator moves between surfaces.
 * This is the command-center "view transition" signature, done in pure CSS (no
 * client JS). Reduced-motion users get an instant cut (handled in admin-os.css).
 */
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <div className="adminos-view">{children}</div>;
}
