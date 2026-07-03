import type { ReactNode } from "react";

/**
 * Per-navigation view-enter for the Seeker OS.
 *
 * Unlike layout.tsx (which persists the shell), template.tsx re-mounts on every
 * route change within the (seeker) segment — so the `.seekeros-view` wrapper
 * replays its settle-in animation each time the seeker moves between surfaces.
 * This is the command-center "view transition" signature, done in pure CSS (no
 * client JS). Reduced-motion users get an instant cut (handled in seeker-os.css).
 */
export default function SeekerTemplate({ children }: { children: ReactNode }) {
  return <div className="seekeros-view">{children}</div>;
}
