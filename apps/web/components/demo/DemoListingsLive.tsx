"use client";

import { useDemoSession } from "./DemoSession";
import { DemoRoleInventory } from "./DemoRoles";

/**
 * The role inventory, fed from the session's applicant list.
 *
 * Same reason as DemoOverviewLive: the per-role application counts on these
 * cards are folds over the applications, so they have to see the same list the
 * pipeline does or the two surfaces disagree.
 */
export function DemoListingsLive({ id }: { readonly id?: string }) {
  const session = useDemoSession();
  return <DemoRoleInventory applicants={session.applicants} id={id} />;
}
