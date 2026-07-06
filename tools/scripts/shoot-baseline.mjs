/**
 * Phase-3 baseline capture — every core surface at mobile + desktop
 * (+ reduced-motion), via the existing shoot.mjs single-route helper.
 *
 * Usage: BASE_URL=http://127.0.0.1:3200 node tools/scripts/shoot-baseline.mjs [outDirSuffix]
 * Output: docs/design/reference/_shots/<suffix>/... (gitignored)
 */
import { execFileSync } from "node:child_process";

const SURFACES = [
  // [path, devRole|null]
  ["/", null],                                 // homepage (guest)
  ["/search", null],                           // public search
  ["/listing/lst_orchard_wenatchee", null],    // listing detail (guest, fixture)
  ["/seek", "seeker"],                         // Seek
  ["/swipe", "seeker"],                        // Swipe
  ["/map", "seeker"],                          // Map
  ["/home", "seeker"],                         // seeker dashboard
  ["/community", "seeker"],                    // Community
  ["/profile", "seeker"],                      // seeker profile (journey)
  ["/host", "host"],                           // host dashboard
];

for (const [path, role] of SURFACES) {
  const args = ["tools/scripts/shoot.mjs", path];
  if (role) args.push(role);
  console.log(`\n=== shooting ${path}${role ? ` as ${role}` : ""} ===`);
  try {
    execFileSync("node", args, { stdio: "inherit", env: process.env });
  } catch {
    console.error(`✗ FAILED: ${path} — continuing with the rest`);
  }
}
