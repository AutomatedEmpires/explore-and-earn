import type { ReactNode } from "react";

/**
 * Per-navigation view-enter for the Host OS.
 *
 * Unlike layout.tsx (which persists the shell), template.tsx re-mounts on every
 * route change within the (host) segment — so the `.hostos-view` wrapper replays
 * its settle-in animation each time the host moves between surfaces. This is the
 * command-center "view transition" signature, done in pure CSS (no client JS).
 * Reduced-motion users get an instant cut (handled in host-os.css).
 */
export default function HostTemplate({ children }: { children: ReactNode }) {
  return <div className="hostos-view">{children}</div>;
}
