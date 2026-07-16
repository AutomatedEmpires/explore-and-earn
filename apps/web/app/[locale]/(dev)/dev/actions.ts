"use server";

import { redirect } from "next/navigation";

import { isDevBenchEnabled, isDevRole, type DevRole } from "../../../../lib/devBench";
import { writeDevRole } from "../../../../lib/devBench/server";

/** Where each role lands after switching, unless an explicit target is given. */
const ROLE_HOME: Record<DevRole, string> = {
  seeker: "/seek",
  // "/host/dashboard" was WRONG: it resolves to the public host-profile route
  // app/host/[id] (id="dashboard" → uuid error). The authed host dashboard is
  // "/host". "/admin" 404s (no (admin)/admin/page.tsx) → land on a real admin
  // surface ("/hosts") instead.
  host: "/host",
  admin: "/hosts",
};

/**
 * Set the impersonated role (dev bench only) and navigate. Inert in
 * production/preview — isDevBenchEnabled() is false there.
 */
export async function setDevRoleAction(formData: FormData): Promise<void> {
  if (!isDevBenchEnabled()) return;

  const role = formData.get("role");
  if (!isDevRole(role)) return;
  await writeDevRole(role);

  const target = formData.get("redirectTo");
  redirect(typeof target === "string" && target.length > 0 ? target : ROLE_HOME[role]);
}
