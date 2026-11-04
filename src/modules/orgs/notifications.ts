// The team's notification types (SP2 spec section 6) and who receives them. Registered when
// the module loads (orgs/index.ts imports this file).
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { OrgRole } from '@/modules/identity';
import { defineType, notify, type NotificationData } from '@/modules/notifications';
import { orgMemberships } from './schema';

/** A role as a noun phrase in a sentence: "an Admin", "a Recruiter". */
export const ROLE_PHRASES: Record<OrgRole, string> = {
  owner: 'the Owner',
  admin: 'an Admin',
  recruiter: 'a Recruiter',
  billing: 'a Billing member',
};

/** A role on its own: "Admin", "Recruiter". */
export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  recruiter: 'Recruiter',
  billing: 'Billing',
};

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

const rolePhrase = (value: unknown): string =>
  typeof value === 'string' && value in ROLE_PHRASES
    ? ROLE_PHRASES[value as OrgRole]
    : 'a team member';

defineType({
  type: 'orgs.member_joined',
  category: 'account',
  title: (d) => `${text(d.memberName, 'Someone')} joined your team`,
  body: (d) => `They joined ${text(d.orgName, 'your organization')} as ${rolePhrase(d.role)}.`,
  url: () => '/host/team',
});

defineType({
  type: 'orgs.member_changed',
  category: 'account',
  title: (d) => `Your access at ${text(d.orgName, 'your team')} changed`,
  body: (d) =>
    d.roleChanged === true
      ? `You're now ${rolePhrase(d.role)}. ${text(d.actorName, 'An Admin')} made the change.`
      : `${text(d.actorName, 'An Admin')} changed which listings you work on.`,
  url: () => '/host',
  email: { template: 'HostNotice' },
});

defineType({
  type: 'orgs.ownership_transferred',
  category: 'security',
  mandatory: true,
  title: (d) => `${text(d.orgName, 'Your organization')} has a new Owner`,
  body: (d) =>
    d.you === 'new'
      ? `You're now the Owner of ${text(d.orgName, 'your organization')}. ${text(
          d.previousOwnerName,
          'The previous Owner',
        )} is an Admin now.`
      : `${text(d.newOwnerName, 'An Admin')} is now the Owner of ${text(
          d.orgName,
          'your organization',
        )}. You're an Admin now. If you didn't do this, contact support right away.`,
  url: () => '/host/team',
  email: { template: 'HostNotice' },
});

/** Notifies every live Owner and Admin of the org, except `exceptUserId`. */
export async function notifyOwnerAdmins(
  db: DbOrTx,
  orgId: string,
  type: string,
  data: NotificationData,
  opts: { exceptUserId?: string } = {},
): Promise<void> {
  const rows = await db
    .select({ userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        inArray(orgMemberships.role, ['owner', 'admin']),
        isNull(orgMemberships.deletedAt),
      ),
    );
  for (const { userId } of rows) {
    if (userId !== opts.exceptUserId) await notify(db, userId, type, data);
  }
}
