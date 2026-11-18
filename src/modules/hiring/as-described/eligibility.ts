// A seeker who shares an email domain with the host's team is not an independent worker.
// Device and payment overlap has no stored identity on the user, so it cannot be compared.
import type { DbOrTx } from '@/lib/db';
import { getUserContact } from '@/modules/identity';
import { listMembers } from '@/modules/orgs';

function domain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** True when the seeker's email domain matches a live member of the org. */
export async function sharesHostDomain(
  db: DbOrTx,
  orgId: string,
  seekerUserId: string,
): Promise<boolean> {
  const contact = await getUserContact(db, seekerUserId);
  const seekerDomain = domain(contact?.email);
  if (!seekerDomain) return false;
  const members = await listMembers(db, orgId);
  return members.some((member) => domain(member.email) === seekerDomain);
}
