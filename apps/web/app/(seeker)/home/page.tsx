import { redirect } from "next/navigation";

/**
 * The standalone /home dashboard is retired. The Profile tab is the seeker's
 * home base (identity + status + matched + the single directory), so /home —
 * which had no inbound links — permanently redirects there.
 */
export default function SeekerHomeRedirect(): never {
  redirect("/profile");
}
