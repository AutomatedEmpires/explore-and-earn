// An in-memory billing module for B1 tests that mock '@/modules/billing'. Every org starts
// entitled on Professional monthly (host since 2026-11-03); setState changes that.
import { newId } from '@/lib/ids';
import type { SubscriptionState } from '@/modules/billing';

const HOST_SINCE = new Date('2026-11-03T00:00:00Z');

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  status: 'active',
  plan: 'professional',
  interval: 'month',
  extraSlots: 0,
  entitled: true,
  canPublish: true,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hostSince: HOST_SINCE,
  founding: 'none',
};

type CardChecks = { hasCard: boolean; cvcCheck: string | null; postalCheck: string | null };

const state = {
  subscriptions: new Map<string, SubscriptionState>(),
  keepLists: new Map<string, string[] | null>(),
  cardChecks: new Map<string, CardChecks>(),
  founding: { redeemed: 0, held: 0, max: 100 },
  calls: [] as { name: string; args: unknown[] }[],
};

const log = (name: string, args: unknown[]) => state.calls.push({ name, args });
const stateOf = (orgId: string) => state.subscriptions.get(orgId) ?? DEFAULT_SUBSCRIPTION_STATE;

const fns = {
  async getSubscriptionState(_db: unknown, orgId: string) {
    log('getSubscriptionState', [orgId]);
    return { ...stateOf(orgId) };
  },

  async getSubscriberBadges(_db: unknown, orgIds: string[]) {
    log('getSubscriberBadges', [orgIds]);
    const out = new Map<string, { hostSince: Date }>();
    for (const orgId of orgIds) {
      const s = stateOf(orgId);
      if (s.entitled) out.set(orgId, { hostSince: s.hostSince ?? HOST_SINCE });
    }
    return out;
  },

  async ensureStripeCustomer(_db: unknown, orgId: string) {
    log('ensureStripeCustomer', [orgId]);
    return `cus_fake_${orgId.replace(/-/g, '').slice(-12)}`;
  },

  async syncSubscription(_db: unknown, stripeSubscriptionId: string) {
    log('syncSubscription', [stripeSubscriptionId]);
  },

  async getPendingKeepList(_db: unknown, orgId: string) {
    log('getPendingKeepList', [orgId]);
    return state.keepLists.get(orgId) ?? null;
  },

  async createFoundingCodes(_db: unknown, i: { count: number; note: string }) {
    log('createFoundingCodes', [i]);
    return Array.from({ length: i.count }, () => {
      const s = newId().replace(/-/g, '').toUpperCase();
      return `EE-${s.slice(-8, -4)}-${s.slice(-4)}`;
    });
  },

  async getFoundingCount() {
    log('getFoundingCount', []);
    return { ...state.founding };
  },

  async settlePendingChange(_db: unknown, orgId: string) {
    log('settlePendingChange', [orgId]);
  },

  async sanctionOrg(_db: unknown, orgId: string, action: 'suspend' | 'ban', actor: unknown) {
    log('sanctionOrg', [orgId, action, actor]);
  },

  async cancelSubscriptionNow(_db: unknown, orgId: string) {
    log('cancelSubscriptionNow', [orgId]);
  },

  async getCardChecks(_db: unknown, orgId: string) {
    log('getCardChecks', [orgId]);
    return {
      ...(state.cardChecks.get(orgId) ?? { hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' }),
    };
  },
} satisfies Partial<typeof import('@/modules/billing')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/billing'), keyof typeof fns>;

export const billingFake = Object.assign(fns as Fns, {
  calls: state.calls,
  /** Merges `partial` over the org's current state. */
  setState(orgId: string, partial: Partial<SubscriptionState>) {
    state.subscriptions.set(orgId, { ...stateOf(orgId), ...partial });
  },
  /** The pending change's keep list (null: no pending change). */
  setKeepList(orgId: string, listingIds: string[] | null) {
    state.keepLists.set(orgId, listingIds);
  },
  setCardChecks(orgId: string, checks: CardChecks) {
    state.cardChecks.set(orgId, checks);
  },
  setFoundingCount(count: { redeemed: number; held: number; max: number }) {
    state.founding = { ...count };
  },
  /** The calls to one function, newest last. */
  callsTo(name: string) {
    return state.calls.filter((c) => c.name === name).map((c) => c.args);
  },
  reset() {
    state.subscriptions.clear();
    state.keepLists.clear();
    state.cardChecks.clear();
    state.founding = { redeemed: 0, held: 0, max: 100 };
    state.calls.length = 0;
  },
});
