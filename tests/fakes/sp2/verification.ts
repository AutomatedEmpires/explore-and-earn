// An in-memory verification module for B1 tests that mock '@/modules/verification'. Orgs are
// `verified` unless setStatus says otherwise; startVerification moves one to `running`.
import type { VerificationStatus } from '@/modules/verification';

const state = {
  statuses: new Map<string, VerificationStatus>(),
  calls: [] as { name: string; args: unknown[] }[],
};

const log = (name: string, args: unknown[]) => state.calls.push({ name, args });

const fns = {
  async getVerificationStatus(_db: unknown, orgId: string) {
    log('getVerificationStatus', [orgId]);
    return state.statuses.get(orgId) ?? 'verified';
  },

  async startVerification(_db: unknown, orgId: string, triggerListingId: string) {
    log('startVerification', [orgId, triggerListingId]);
    state.statuses.set(orgId, 'running');
  },

  async requestReverification(_db: unknown, orgId: string) {
    log('requestReverification', [orgId]);
  },

  async openVerificationAppeal(_db: unknown, orgId: string, note: string) {
    log('openVerificationAppeal', [orgId, note]);
  },
} satisfies Partial<typeof import('@/modules/verification')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/verification'), keyof typeof fns>;

export const verificationFake = Object.assign(fns as Fns, {
  calls: state.calls,
  setStatus(orgId: string, status: VerificationStatus) {
    state.statuses.set(orgId, status);
  },
  reset() {
    state.statuses.clear();
    state.calls.length = 0;
  },
});
