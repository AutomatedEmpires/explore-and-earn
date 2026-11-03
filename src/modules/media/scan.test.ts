import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type DbOrTx } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import type { CheckResult, OpenReviewItemInput, RunCheckInput } from '@/modules/trust';
import { pdfWithEicar } from '../../../tests/fixtures/media/eicar';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
// The module index registers the `media` trust subject (with the mocked trust below).
import { jobHandlers } from './index';
import type { MediaKind } from './kinds';
import { scanMedia } from './scan';
import {
  cloudmersiveScanner,
  photoDnaScanner,
  stubChildSafetyScanner,
  stubMalwareScanner,
} from './scanners';
import { getStorage, type MemoryStorage } from './storage';
import { completeUpload, requestUpload } from './uploads';

// The trust module (W5) is replaced by a fake that keeps the documented contract:
// runCheck returns the verdict set for the subject (default approved) and, like the real one,
// opens a moderation item on needs_review; openReviewItem records the item; decide() runs the
// subject handler registered for the item's subject type, the way trust.decide applies it.
type SubjectHandler = (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>;
type FakeItem = OpenReviewItemInput & { id: string; resolution?: string };

const trust = vi.hoisted(() => {
  const subjects = new Map<string, Partial<Record<string, SubjectHandler>>>();
  const items: FakeItem[] = [];
  const checks: RunCheckInput[] = [];
  const verdicts = new Map<string, CheckResult['decision']>();

  const openReviewItem = async (_db: DbOrTx, i: OpenReviewItemInput) => {
    const id = globalThis.crypto.randomUUID();
    items.push({ ...i, id });
    return { id };
  };

  return {
    subjects,
    items,
    checks,
    verdicts,
    openReviewItem,
    registerSubjectHandlers(subjectType: string, h: Partial<Record<string, SubjectHandler>>) {
      subjects.set(subjectType, h);
    },
    async runCheck(db: DbOrTx, i: RunCheckInput): Promise<CheckResult> {
      checks.push(i);
      const checkId = globalThis.crypto.randomUUID();
      const decision = verdicts.get(i.subjectId) ?? 'approved';
      const score = { approved: 0.02, needs_review: 0.5, rejected: 0.95 }[decision];
      if (decision === 'needs_review') {
        await openReviewItem(db, {
          queue: 'moderation',
          subjectType: i.subjectType,
          subjectId: i.subjectId,
          reason: 'needs_review',
          checkId,
          aiConfidence: score,
        });
      }
      const result: CheckResult = { checkId, decision, score, labels: [], reason: 'fake' };
      if (i.wantAltText) result.altText = 'Test image';
      return result;
    },
    async decide(db: DbOrTx, itemId: string, action: 'approve' | 'remove') {
      const item = items.find((x) => x.id === itemId);
      if (!item) throw new Error(`no item ${itemId}`);
      const handler = subjects.get(item.subjectType)?.[action];
      if (!handler) throw new Error(`no ${action} handler for ${item.subjectType}`);
      await db.transaction(async (tx) => handler(tx, item.subjectId));
      item.resolution = action;
    },
  };
});

vi.mock('@/modules/trust', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/trust')>()),
  openReviewItem: trust.openReviewItem,
  registerSubjectHandlers: trust.registerSubjectHandlers,
  runCheck: trust.runCheck,
}));

const FIXTURES = path.resolve('tests/fixtures/media');
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let t: TestDb;
let storage: MemoryStorage;

beforeAll(async () => {
  vi.stubEnv('STORAGE_PROVIDER', 'stub');
  vi.stubEnv('CHILD_SAFETY_PROVIDER', 'stub');
  vi.stubEnv('MALWARE_PROVIDER', 'stub');
  resetEnvCache();
  storage = getStorage() as MemoryStorage;
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
  vi.unstubAllEnvs();
  resetEnvCache();
});

beforeEach(async () => {
  trust.items.length = 0;
  trust.checks.length = 0;
  trust.verdicts.clear();
  await t.db.execute(sql`delete from app.outbox`);
});

const deps = (blockedHashes: string[] = []) => ({
  storage,
  childSafety: stubChildSafetyScanner(blockedHashes),
  malware: stubMalwareScanner(),
});

async function uploaded(kind: MediaKind, mime: string, bytes: Uint8Array) {
  const userId = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
  const { mediaId } = await requestUpload(
    t.db,
    storage,
    { userId },
    {
      kind,
      mime,
      sizeBytes: bytes.byteLength,
    },
  );
  await storage.write('quarantine', mediaId, bytes, mime);
  await completeUpload(t.db, { userId }, mediaId);
  return { userId, mediaId };
}

type Row = {
  status: string;
  bucket: string;
  path: string;
  detected_mime: string | null;
  rejection_reason: string | null;
  size_bytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  variants: Record<string, string> | null;
};

async function row(mediaId: string): Promise<Row> {
  const [r] = await queryRows<Row>(
    t.db,
    sql`select status, bucket, path, detected_mime, rejection_reason, size_bytes, sha256, width,
          height, alt_text, variants from app.media where id = ${mediaId}`,
  );
  if (!r) throw new Error(`no media ${mediaId}`);
  return r;
}

const objectsOf = (bucket: Parameters<MemoryStorage['list']>[0], mediaId: string) =>
  storage.list(bucket).filter((p) => p.startsWith(mediaId));

describe('scanMedia: the real type comes from the bytes (Review Focus 3)', () => {
  it('rejects a PDF declared as image/jpeg with type_mismatch', async () => {
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', fixture('disguised.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');

    const r = await row(mediaId);
    expect(r).toMatchObject({
      status: 'rejected',
      rejection_reason: 'type_mismatch',
      detected_mime: 'application/pdf',
    });
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(trust.checks).toEqual([]);
  });

  it('rejects an SVG declared as image/png with type_mismatch', async () => {
    const { mediaId } = await uploaded('avatar', 'image/png', fixture('image.svg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'type_mismatch' });
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('rejects a real PNG declared as image/jpeg', async () => {
    const { mediaId } = await uploaded('avatar', 'image/jpeg', fixture('gps.png'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({
      rejection_reason: 'type_mismatch',
      detected_mime: 'image/png',
    });
  });

  it('re-encodes a PNG with a script appended, so no variant carries the script', async () => {
    const original = fixture('script.png');
    expect(Buffer.from(original).includes('<script>')).toBe(true);
    const { mediaId } = await uploaded('cover', 'image/png', original);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    const r = await row(mediaId);
    for (const p of Object.values(r.variants ?? {})) {
      const bytes = await storage.read('media-public', p);
      expect(Buffer.from(bytes).includes('<script')).toBe(false);
    }
  });
});

describe('scanMedia: images', () => {
  it('strips EXIF (GPS) from a JPEG and writes 3 WebP variants to media-public', async () => {
    const original = fixture('gps.jpg');
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', original);

    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');

    const r = await row(mediaId);
    expect(r).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
      path: mediaId,
      detected_mime: 'image/jpeg',
      size_bytes: original.byteLength,
      sha256: sha256(original),
      width: 96,
      height: 64,
      alt_text: 'Test image',
    });
    expect(Object.keys(r.variants ?? {}).sort()).toEqual(['1280', '320', '640']);
    for (const p of Object.values(r.variants ?? {})) {
      const meta = await sharp(await storage.read('media-public', p)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(storage.contentType('media-public', p)).toBe('image/webp');
    }
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);

    // The classifier sees the stripped, re-encoded image, and is asked for alt text.
    expect(trust.checks).toHaveLength(1);
    expect(trust.checks[0]).toMatchObject({
      kind: 'image_safety',
      subjectType: 'media',
      subjectId: mediaId,
      wantAltText: true,
      image: { mime: 'image/webp' },
    });
    const sent = trust.checks[0]?.image?.bytes ?? new Uint8Array();
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
  });

  it('asks for alt text only for photos shown on public pages', async () => {
    const { mediaId } = await uploaded('avatar', 'image/png', fixture('gps.png'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(trust.checks[0]?.wantAltText).toBe(false);
    expect((await row(mediaId)).alt_text).toBeNull();
  });

  it('keeps approved image attachments private', async () => {
    const { mediaId } = await uploaded('attachment', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await row(mediaId)).toMatchObject({ bucket: 'media-private' });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('blocks a child-safety match: evidence copy, child-safety item, nothing public', async () => {
    const original = fixture('gps.jpg');
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', original);

    expect(await scanMedia(t.db, deps([sha256(original)]), mediaId)).toBe('blocked');

    expect(await row(mediaId)).toMatchObject({ status: 'blocked', bucket: 'evidence' });
    expect([...(await storage.read('evidence', mediaId))]).toEqual([...original]);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('media-private', mediaId)).toEqual([]);
    // The quarantine original is kept too.
    expect(objectsOf('quarantine', mediaId)).toEqual([mediaId]);

    expect(trust.items).toEqual([
      expect.objectContaining({
        queue: 'child_safety',
        subjectType: 'media',
        subjectId: mediaId,
        priority: 1000,
      }),
    ]);
    // Nothing else happens automatically: no AI check.
    expect(trust.checks).toEqual([]);
    const audit = await queryRows<{ action: string }>(
      t.db,
      sql`select action from app.audit_events where subject_id = ${mediaId}`,
    );
    expect(audit).toEqual([{ action: 'media.blocked' }]);
  });

  it('holds a flagged image in review; approving it through decide publishes it', async () => {
    const { mediaId } = await uploaded('housing_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'needs_review');

    expect(await scanMedia(t.db, deps(), mediaId)).toBe('in_review');
    expect(await row(mediaId)).toMatchObject({ status: 'in_review', bucket: 'media-private' });
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);

    const item = trust.items.find((i) => i.subjectId === mediaId);
    expect(item).toMatchObject({ queue: 'moderation', subjectType: 'media' });

    await trust.decide(t.db, item?.id ?? '', 'approve');

    expect(await row(mediaId)).toMatchObject({ status: 'approved', bucket: 'media-public' });
    expect(objectsOf('media-public', mediaId)).toHaveLength(3);

    // The private copies are removed by a job that only runs once the decision committed.
    expect(objectsOf('media-private', mediaId)).toHaveLength(3);
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-private', mediaId)).toEqual([]);
  });

  it('removing a flagged image rejects it and deletes the held copies', async () => {
    const { mediaId } = await uploaded('meal_photo', 'image/png', fixture('gps.png'));
    trust.verdicts.set(mediaId, 'needs_review');
    await scanMedia(t.db, deps(), mediaId);
    const item = trust.items.find((i) => i.subjectId === mediaId);

    await trust.decide(t.db, item?.id ?? '', 'remove');

    expect(await row(mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'removed_by_operator',
    });
    await runWorker(t.db, { handlers: jobHandlers });
    expect(objectsOf('media-private', mediaId)).toEqual([]);
    expect(objectsOf('media-public', mediaId)).toEqual([]);
  });

  it('refuses to approve while the scan has not finished', async () => {
    const { mediaId } = await uploaded('listing_photo', 'image/jpeg', fixture('gps.jpg'));
    const approve = trust.subjects.get('media')?.approve;
    await expect(approve?.(t.db, mediaId)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects an image the classifier rejects, keeping no copy', async () => {
    const { mediaId } = await uploaded('community_photo', 'image/jpeg', fixture('gps.jpg'));
    trust.verdicts.set(mediaId, 'rejected');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'unsafe_content' });
    for (const bucket of ['quarantine', 'media-public', 'media-private'] as const) {
      expect(objectsOf(bucket, mediaId)).toEqual([]);
    }
  });
});

describe('scanMedia: PDFs', () => {
  it('rejects a PDF containing EICAR with malware', async () => {
    const { mediaId } = await uploaded('resume', 'application/pdf', pdfWithEicar());
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({
      rejection_reason: 'malware',
      detected_mime: 'application/pdf',
    });
    expect(objectsOf('media-private', mediaId)).toEqual([]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });

  it('approves a clean PDF into media-private', async () => {
    const pdf = fixture('doc.pdf');
    const { mediaId } = await uploaded('resume', 'application/pdf', pdf);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await row(mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-private',
      path: `${mediaId}.pdf`,
    });
    expect([...(await storage.read('media-private', `${mediaId}.pdf`))]).toEqual([...pdf]);
    expect(objectsOf('quarantine', mediaId)).toEqual([]);
  });
});

describe('scanMedia: robustness', () => {
  it('rejects with missing_file when nothing was uploaded', async () => {
    const userId = newId();
    await t.db.execute(
      sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`,
    );
    const { mediaId } = await requestUpload(
      t.db,
      storage,
      { userId },
      {
        kind: 'avatar',
        mime: 'image/png',
        sizeBytes: 100,
      },
    );
    await completeUpload(t.db, { userId }, mediaId);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'missing_file' });
  });

  it('rejects a file larger than its kind allows, whatever was declared', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(fixture('doc.pdf'));
    const userId = newId();
    await t.db.execute(
      sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`,
    );
    const { mediaId } = await requestUpload(
      t.db,
      storage,
      { userId },
      {
        kind: 'resume',
        mime: 'application/pdf',
        sizeBytes: 1000,
      },
    );
    await storage.write('quarantine', mediaId, big, 'application/pdf');
    await completeUpload(t.db, { userId }, mediaId);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    expect(await row(mediaId)).toMatchObject({ rejection_reason: 'too_large' });
  });

  it('does nothing for a file that is already scanned', async () => {
    const { mediaId } = await uploaded('avatar', 'image/jpeg', fixture('gps.jpg'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    expect(trust.checks).toHaveLength(1);
  });

  it('runs from the media.scan job queued by completeUpload', async () => {
    const { mediaId } = await uploaded('logo', 'image/png', fixture('gps.png'));
    const result = await runWorker(t.db, { handlers: jobHandlers });
    expect(result).toMatchObject({ processed: 1, retried: 0, dead: 0 });
    expect((await row(mediaId)).status).toBe('approved');
  });

  it('drops a scan job for media that no longer exists instead of retrying it', async () => {
    await expect(
      jobHandlers['media.scan']?.({ mediaId: newId() }, { db: t.db, now: new Date() }),
    ).resolves.toBeUndefined();
  });
});

describe('scanners', () => {
  it('the stub child-safety scanner reads CHILD_SAFETY_STUB_HASHES on every call', async () => {
    const bytes = fixture('gps.jpg');
    const scanner = stubChildSafetyScanner();
    expect((await scanner.scanImage(bytes)).match).toBe(false);
    vi.stubEnv('CHILD_SAFETY_STUB_HASHES', ` deadbeef , ${sha256(bytes).toUpperCase()} `);
    resetEnvCache();
    try {
      expect(await scanner.scanImage(bytes)).toEqual({
        match: true,
        provider: 'stub',
        reference: `sha256:${sha256(bytes)}`,
      });
    } finally {
      vi.stubEnv('CHILD_SAFETY_STUB_HASHES', '');
      resetEnvCache();
    }
  });

  it('the stub malware scanner flags EICAR anywhere in the file', async () => {
    const scanner = stubMalwareScanner();
    expect(await scanner.scanFile(pdfWithEicar(), 'a.pdf')).toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
    expect(await scanner.scanFile(fixture('doc.pdf'), 'b.pdf')).toEqual({ clean: true });
  });

  it('Cloudmersive: sends the file with the API key, reads the verdict, fails closed', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const reply = (status: number, body: unknown) =>
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json(body, { status });
      });

    const infected = cloudmersiveScanner({
      apiKey: 'cm-key',
      fetch: reply(200, {
        CleanResult: false,
        FoundViruses: [{ FileName: 'a', VirusName: 'Eicar' }],
      }),
    });
    expect(await infected.scanFile(fixture('doc.pdf'), 'a.pdf')).toEqual({
      clean: false,
      threat: 'Eicar',
    });
    expect(calls[0]?.url).toBe('https://api.cloudmersive.com/virus/scan/file');
    expect(new Headers(calls[0]?.init?.headers).get('Apikey')).toBe('cm-key');
    expect((calls[0]?.init?.body as FormData).get('inputFile')).toBeInstanceOf(Blob);

    const clean = cloudmersiveScanner({ apiKey: 'k', fetch: reply(200, { CleanResult: true }) });
    expect(await clean.scanFile(fixture('doc.pdf'), 'a.pdf')).toEqual({ clean: true });

    const down = cloudmersiveScanner({ apiKey: 'k', fetch: reply(503, {}) });
    await expect(down.scanFile(fixture('doc.pdf'), 'a.pdf')).rejects.toThrow(/503/);
    const odd = cloudmersiveScanner({ apiKey: 'k', fetch: reply(200, { verdict: 'ok' }) });
    await expect(odd.scanFile(fixture('doc.pdf'), 'a.pdf')).rejects.toThrow();
  });

  it('PhotoDNA: sends the image inline with the key, reads IsMatch, fails closed', async () => {
    let sent: { DataRepresentation: string; Value: string } | undefined;
    let key: string | null = null;
    const reply = (body: unknown) =>
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        key = new Headers(init?.headers).get('Ocp-Apim-Subscription-Key');
        sent = JSON.parse(String(init?.body)) as typeof sent;
        return Response.json(body);
      });

    const ok = { Status: { Code: 3000, Description: 'OK' }, TrackingId: 'trk_1' };
    const hit = photoDnaScanner({ key: 'pdna', fetch: reply({ ...ok, IsMatch: true }) });
    const jpg = fixture('gps.jpg');
    expect(await hit.scanImage(jpg)).toEqual({
      match: true,
      provider: 'photodna',
      reference: 'trk_1',
    });
    expect(key).toBe('pdna');
    expect(sent).toEqual({
      DataRepresentation: 'inline',
      Value: Buffer.from(jpg).toString('base64'),
    });

    // A format PhotoDNA does not read is converted (hashes survive re-encoding).
    const webp = new Uint8Array(await sharp(jpg).webp().toBuffer());
    const miss = photoDnaScanner({ key: 'pdna', fetch: reply({ ...ok, IsMatch: false }) });
    expect((await miss.scanImage(webp)).match).toBe(false);
    expect((await sharp(Buffer.from(sent?.Value ?? '', 'base64')).metadata()).format).toBe('png');

    const failing = photoDnaScanner({
      key: 'pdna',
      fetch: reply({ Status: { Code: 3208, Description: 'Bad image' }, IsMatch: false }),
    });
    await expect(failing.scanImage(jpg)).rejects.toThrow(/3208/);
  });
});
