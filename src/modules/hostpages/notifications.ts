// The hostpages notification types (SP2 spec section 6) and who receives them. Registered when
// the module loads (hostpages/index.ts imports this file).
import type { DbOrTx } from '@/lib/db';
import { defineType, notify, type NotificationData } from '@/modules/notifications';
import { listMembers } from '@/modules/orgs';

export const CONTENT_HELD = 'hostpages.content_held';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** A sentence ending in a full stop, question or exclamation mark. */
const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

defineType({
  type: CONTENT_HELD,
  category: 'account',
  title: (d) =>
    d.rejected === true
      ? "We couldn't publish your host page changes"
      : text(d.note)
        ? 'We have a question about your host page changes'
        : "We're taking a closer look at your host page changes",
  body: (d) => {
    const note = text(d.note);
    if (note) return `An Explore&Earn reviewer asked: "${note}" Your current page stays live.`;
    if (d.rejected === true) {
      const reason = text(d.reason);
      return reason
        ? `${sentence(`Your latest changes weren't published: ${reason}`)} Edit them and save again.`
        : "Your latest changes weren't published. Edit them and save again.";
    }
    return 'This usually takes a few hours. Your current page stays live until then.';
  },
  url: () => '/host/host-page',
  email: { template: 'HostNotice' },
});

/** Notifies the org's Owner and every Admin. */
export async function notifyOwnerAdmins(
  db: DbOrTx,
  orgId: string,
  type: string,
  data: NotificationData,
): Promise<void> {
  const members = await listMembers(db, orgId);
  for (const m of members) {
    if (m.role === 'owner' || m.role === 'admin') await notify(db, m.userId, type, data);
  }
}
