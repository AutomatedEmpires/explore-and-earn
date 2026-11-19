// An in-memory hostpages module for B1 tests that mock '@/modules/hostpages'.
import type { HostIdentity, HostPageProvider } from '@/modules/hostpages';

const state = {
  identities: new Map<string, HostIdentity>(),
  follows: new Map<string, string[]>(),
  slugs: [] as { slug: string; updatedAt: Date }[],
  providers: [] as HostPageProvider[],
  calls: [] as { name: string; args: unknown[] }[],
};

const log = (name: string, args: unknown[]) => state.calls.push({ name, args });

const fns = {
  async getHostIdentities(_db: unknown, orgIds: string[]) {
    log('getHostIdentities', [orgIds]);
    const out = new Map<string, HostIdentity>();
    for (const id of orgIds) {
      const h = state.identities.get(id);
      if (h) out.set(id, { ...h });
    }
    return out;
  },

  async listPublicHostSlugs(_db: unknown, i: { after?: string; limit: number }) {
    log('listPublicHostSlugs', [i]);
    const sorted = [...state.slugs].sort((a, b) => a.slug.localeCompare(b.slug));
    const from = i.after ? sorted.filter((s) => s.slug > (i.after as string)) : sorted;
    const items = from.slice(0, i.limit);
    const last = items[items.length - 1];
    return { items, next: from.length > i.limit && last ? last.slug : null };
  },

  async unfollow(_db: unknown, userId: string, orgId: string) {
    log('unfollow', [userId, orgId]);
    state.follows.set(
      orgId,
      (state.follows.get(orgId) ?? []).filter((id) => id !== userId),
    );
  },

  async listFollowerIds(_db: unknown, orgId: string, i: { after?: string; limit: number }) {
    log('listFollowerIds', [orgId, i]);
    const all = [...(state.follows.get(orgId) ?? [])].sort();
    const from = i.after ? all.filter((id) => id > (i.after as string)) : all;
    const userIds = from.slice(0, i.limit);
    const last = userIds[userIds.length - 1];
    return { userIds, next: from.length > i.limit && last ? last : null };
  },

  registerHostPageProvider(p: HostPageProvider) {
    log('registerHostPageProvider', [p.kind]);
    state.providers.push(p);
  },
} satisfies Partial<typeof import('@/modules/hostpages')>;

/** The module's own signatures, so callers type-check exactly as against the real module. */
type Fns = Pick<typeof import('@/modules/hostpages'), keyof typeof fns>;

export const hostpagesFake = Object.assign(fns as Fns, {
  calls: state.calls,
  providers: state.providers,
  setIdentity(h: HostIdentity) {
    state.identities.set(h.orgId, { ...h });
  },
  setFollowers(orgId: string, userIds: string[]) {
    state.follows.set(orgId, [...userIds]);
  },
  setPublicSlugs(slugs: { slug: string; updatedAt: Date }[]) {
    state.slugs = slugs.map((s) => ({ ...s }));
  },
  reset() {
    state.identities.clear();
    state.follows.clear();
    state.slugs = [];
    state.calls.length = 0;
  },
});
