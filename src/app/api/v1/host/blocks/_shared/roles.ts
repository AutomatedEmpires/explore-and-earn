// Who in a host org manages its block list (SP4 spec 5): Owners and Admins. Recruiters may
// block an applicant (PUT /host/blocks is host*) but not list or lift blocks.
import { forbidden } from '@/lib/errors';
import type { HostContext } from '@/server/guards';

const BLOCK_ADMINS: readonly HostContext['role'][] = ['owner', 'admin'];

export function requireBlockAdmin(host: HostContext): void {
  if (!BLOCK_ADMINS.includes(host.role)) {
    throw forbidden("Only an Owner or Admin can manage your organization's blocks.", {
      reason: 'role_not_allowed',
    });
  }
}
