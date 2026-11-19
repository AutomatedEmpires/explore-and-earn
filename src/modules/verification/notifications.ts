// Verification notification types (SP2 spec section 6), registered when the module loads, and
// the Owner-and-Admins recipient group they go to.
import type { DbOrTx } from '@/lib/db';
import { defineType, notify, type NotificationData } from '@/modules/notifications';
import { listMembers } from '@/modules/orgs';

/** Where a host reads and answers their verification status. */
export const VERIFICATION_SETTINGS_PATH = '/host/settings/verification';

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

defineType({
  type: 'verification.needs_info',
  category: 'account',
  mandatory: true,
  title: () => 'We need a little more information to verify your business',
  body: (d) => {
    const note = text(d.note);
    const ask = 'Add it in your verification settings and we will take it from there.';
    return note ? `${note}\n${ask}` : ask;
  },
  url: () => VERIFICATION_SETTINGS_PATH,
  email: { template: 'HostNotice' },
});

defineType({
  type: 'verification.decided',
  category: 'account',
  title: (d) =>
    d.status === 'failed' ? "We couldn't verify your business" : 'Your business is verified',
  body: (d) =>
    d.status === 'failed'
      ? "Your listings can't go live for now. If you think we got this wrong, ask for a review in your verification settings."
      : 'Thanks for waiting. Any listing that was waiting on this check now carries on through its remaining checks.',
  url: () => VERIFICATION_SETTINGS_PATH,
  email: { template: 'HostNotice' },
});

/** Notifies the org's Owner and Admins. */
export async function notifyOwnerAdmins(
  db: DbOrTx,
  orgId: string,
  type: 'verification.needs_info' | 'verification.decided',
  data: NotificationData,
): Promise<void> {
  const members = await listMembers(db, orgId);
  for (const m of members) {
    if (m.role === 'owner' || m.role === 'admin') {
      await notify(db, m.userId, type, {
        ...data,
        href: VERIFICATION_SETTINGS_PATH,
        buttonLabel: 'Open verification settings',
      });
    }
  }
}
