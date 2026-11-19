// The host page's provider slots (SP2 spec section 3). Later sub-projects fill them by calling
// registerHostPageProvider at module load, so hostpages never imports them: SP5 registers
// `reply_time` and `as_described`, SP6 `pinned_announcement`. A slot with no provider renders
// nothing.
import type { DbOrTx } from '@/lib/db';

export type Tally = { yes: number; partly: number; no: number };

export type PinnedAnnouncement = {
  id: string;
  title: string;
  body: string;
  mediaId: string | null;
  endsAt: Date;
  ctaHref: string;
};

/** A later sub-project's slot on the host page; a slot with no provider renders nothing. */
export type HostPageProvider =
  | {
      kind: 'reply_time';
      fn: (
        db: DbOrTx,
        orgId: string,
      ) => Promise<{ conversations: number; withinADay: boolean } | null>;
    }
  | {
      kind: 'as_described';
      fn: (
        db: DbOrTx,
        orgId: string,
      ) => Promise<{ responses: number; housing: Tally; meals: Tally; pay: Tally } | null>;
    }
  | {
      kind: 'pinned_announcement';
      fn: (db: DbOrTx, orgId: string) => Promise<PinnedAnnouncement[]>;
    };

type ProviderOf<K extends HostPageProvider['kind']> = Extract<HostPageProvider, { kind: K }>;

const providers = new Map<HostPageProvider['kind'], HostPageProvider>();

/** Fills one slot. Each slot takes one provider; a second registration for it throws. */
export function registerHostPageProvider(p: HostPageProvider): void {
  if (providers.has(p.kind)) {
    throw new Error(`A host page provider for "${p.kind}" is already registered`);
  }
  providers.set(p.kind, p);
}

/** The provider registered for `kind`, if any. */
export function getHostPageProvider<K extends HostPageProvider['kind']>(
  kind: K,
): ProviderOf<K> | undefined {
  return providers.get(kind) as ProviderOf<K> | undefined;
}

/** Empties every slot. Tests only; not exported from the module's index. */
export function resetHostPageProviders(): void {
  providers.clear();
}
