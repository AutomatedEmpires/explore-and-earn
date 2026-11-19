// An in-memory media module for SP3 tests that mock '@/modules/media' (SP3 plan Task 5):
//
//   vi.mock('@/modules/media', async (orig) => ({
//     ...(await orig<typeof import('@/modules/media')>()),
//     ...(await import('../../../tests/fakes/media')).mediaFake,
//   }));
//
// Every media id is an approved image: getMediaUrl returns https://media.test/<id>/<width>.webp
// (ignoring its storage and viewer), getMediaInfo gives the alt text "Alt for <id>", and
// getStorage is one in-memory store. It imports no module at runtime, so it can stand in for one.
import type { DbOrTx } from '@/lib/db';
import type { MediaInfo, MediaViewer, Storage, VariantWidth } from '@/modules/media';

type Fns = Pick<typeof import('@/modules/media'), 'getMediaUrl' | 'getMediaInfo' | 'getStorage'>;

/** A Map-backed Storage (the real memoryStorage, minus the path checks). */
function memoryStore(): Storage {
  const objects = new Map<string, Uint8Array>();
  const key = (bucket: string, p: string) => `${bucket}/${p}`;
  const missing = (bucket: string, p: string) => new Error(`Object not found: ${bucket}/${p}`);
  return {
    async signedUploadUrl(bucket, p) {
      return { url: `memory://${bucket}/${p}?token=fake`, token: 'fake' };
    },
    async read(bucket, p) {
      const found = objects.get(key(bucket, p));
      if (!found) throw missing(bucket, p);
      return new Uint8Array(found);
    },
    async write(bucket, p, bytes) {
      objects.set(key(bucket, p), new Uint8Array(bytes));
    },
    async copy(from, to) {
      const found = objects.get(key(from.bucket, from.path));
      if (!found) throw missing(from.bucket, from.path);
      objects.set(key(to.bucket, to.path), new Uint8Array(found));
    },
    async remove(bucket, p) {
      objects.delete(key(bucket, p));
    },
    async signedUrl(bucket, p, expiresSec) {
      if (!objects.has(key(bucket, p))) throw missing(bucket, p);
      return `memory://${bucket}/${p}?expiresIn=${expiresSec}`;
    },
    publicUrl(bucket, p) {
      return `memory://${bucket}/${p}`;
    },
  };
}

const state = {
  storage: null as Storage | null,
  calls: [] as { name: string; args: unknown[] }[],
};

const fns: Fns = {
  async getMediaUrl(
    _db: DbOrTx,
    _storage: Storage,
    _viewer: MediaViewer,
    mediaId: string,
    variant?: VariantWidth,
  ) {
    state.calls.push({ name: 'getMediaUrl', args: [mediaId, variant] });
    return `https://media.test/${mediaId}/${variant ?? 1280}.webp`;
  },

  async getMediaInfo(_db: DbOrTx, ids: string[]) {
    state.calls.push({ name: 'getMediaInfo', args: [ids] });
    const out = new Map<string, MediaInfo>();
    for (const id of ids) {
      out.set(id, {
        ownerOrgId: null,
        kind: 'cover',
        status: 'approved',
        altText: `Alt for ${id}`,
        width: 1280,
        height: 960,
      });
    }
    return out;
  },

  getStorage() {
    state.storage ??= memoryStore();
    return state.storage;
  },
};

export const mediaFake = Object.assign(fns, {
  calls: state.calls,
  /** A fresh store and no recorded calls. */
  reset() {
    state.storage = null;
    state.calls.length = 0;
  },
});
