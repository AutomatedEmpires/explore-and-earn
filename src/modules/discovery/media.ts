// Public media for projection rows (SP3 plan Task 8): the cover's three variant URLs and its
// alt text, and the host logo. URLs are asked for as a system viewer that owns nothing, so only
// approved files in the public bucket come back; anything else (still scanning, private,
// removed) simply has no URL and the row shows no image.
import type { DbOrTx } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { getMediaInfo, getMediaUrl, getStorage, type MediaViewer } from '@/modules/media';

export const SYSTEM_VIEWER: MediaViewer = {
  userId: '00000000-0000-0000-0000-000000000000',
  orgIds: [],
  isOperator: false,
};

const WIDTHS = [320, 640, 1280] as const;

/** The 320, 640 and 1280 URLs of each public image among `ids`; others are left out. */
export async function publicMediaUrls(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, Record<320 | 640 | 1280, string>>> {
  const out = new Map<string, Record<320 | 640 | 1280, string>>();
  const storage = getStorage();
  for (const id of new Set(ids)) {
    try {
      const urls: string[] = [];
      for (const w of WIDTHS) urls.push(await getMediaUrl(db, storage, SYSTEM_VIEWER, id, w));
      const [s320, s640, s1280] = urls;
      if (s320 && s640 && s1280) out.set(id, { 320: s320, 640: s640, 1280: s1280 });
    } catch (err) {
      // not_found or forbidden: not public (yet). A database failure still throws, so the
      // sync retries instead of writing a row without its cover.
      if (!isAppError(err)) throw err;
    }
  }
  return out;
}

/** The alt text of each known media id (null when the file has none). */
export async function mediaAlt(db: DbOrTx, ids: string[]): Promise<Map<string, string | null>> {
  const info = await getMediaInfo(db, ids);
  return new Map([...info].map(([id, m]) => [id, m.altText]));
}
