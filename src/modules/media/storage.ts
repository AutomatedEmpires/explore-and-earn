// File storage behind one interface (spec section 7). Three implementations:
// - supabaseStorage(): Supabase Storage with the service-role key (preview and prod);
// - localStorage(dir): files on disk, served by /api/v1/media/local/[...path] (dev only);
// - memoryStorage(): in-process, for unit tests (STORAGE_PROVIDER=stub, which the environment
//   check accepts only under a test runner: no browser can upload to it).
// The environment check refuses `local` and `stub` when APP_ENV=prod.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { BUCKETS, type Bucket } from './kinds';

export { BUCKETS, type Bucket } from './kinds';

export type ObjectRef = { bucket: Bucket; path: string };

export interface Storage {
  /** A URL the client uploads the file to directly (PUT), and the token that authorizes it. */
  signedUploadUrl(bucket: Bucket, path: string): Promise<{ url: string; token: string }>;
  /** Throws ObjectNotFoundError when there is no such object. */
  read(bucket: Bucket, path: string): Promise<Uint8Array>;
  /** Creates or replaces the object. */
  write(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Copies an object, replacing the target if it exists. */
  copy(from: ObjectRef, to: ObjectRef): Promise<void>;
  /** Deletes the object; a missing object is not an error. */
  remove(bucket: Bucket, path: string): Promise<void>;
  /** A URL that reads a private object for `expiresSec` seconds. */
  signedUrl(bucket: Bucket, path: string, expiresSec: number): Promise<string>;
  /** The permanent URL of an object in the public bucket. */
  publicUrl(bucket: Bucket, path: string): string;
}

export class ObjectNotFoundError extends Error {
  constructor(bucket: string, objectPath: string, options?: ErrorOptions) {
    super(`Object not found: ${bucket}/${objectPath}`, options);
    this.name = 'ObjectNotFoundError';
  }
}

/** Signed upload URLs last as long as Supabase's (2 hours). */
const UPLOAD_URL_TTL_SEC = 2 * 60 * 60;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Object paths are relative, `/`-separated, and never climb out of their bucket. */
export function isSafeObjectPath(objectPath: string): boolean {
  const segments = objectPath.split('/');
  return segments.length > 0 && segments.every((s) => SEGMENT.test(s) && !/^\.+$/.test(s));
}

function assertSafe(bucket: string, objectPath: string): void {
  if (!(BUCKETS as readonly string[]).includes(bucket))
    throw new Error(`Unknown bucket: ${bucket}`);
  if (!isSafeObjectPath(objectPath)) throw new Error(`Unsafe object path: ${objectPath}`);
}

// --- Memory -------------------------------------------------------------------------------

export type MemoryStorage = Storage & {
  /** Whether the object exists. */
  has(bucket: Bucket, path: string): boolean;
  /** Every object path in `bucket`, sorted. */
  list(bucket: Bucket): string[];
  /** The content type the object was written with. */
  contentType(bucket: Bucket, path: string): string | undefined;
};

/** In-process storage for tests. URLs use the `memory://` scheme and are never fetched. */
export function memoryStorage(): MemoryStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const key = (bucket: string, p: string) => `${bucket}/${p}`;

  return {
    async signedUploadUrl(bucket, p) {
      assertSafe(bucket, p);
      const token = randomBytes(16).toString('base64url');
      return { url: `memory://${bucket}/${p}?token=${token}`, token };
    },
    async read(bucket, p) {
      const found = objects.get(key(bucket, p));
      if (!found) throw new ObjectNotFoundError(bucket, p);
      return new Uint8Array(found.bytes);
    },
    async write(bucket, p, bytes, contentType) {
      assertSafe(bucket, p);
      objects.set(key(bucket, p), { bytes: new Uint8Array(bytes), contentType });
    },
    async copy(from, to) {
      assertSafe(to.bucket, to.path);
      const found = objects.get(key(from.bucket, from.path));
      if (!found) throw new ObjectNotFoundError(from.bucket, from.path);
      objects.set(key(to.bucket, to.path), { ...found, bytes: new Uint8Array(found.bytes) });
    },
    async remove(bucket, p) {
      objects.delete(key(bucket, p));
    },
    async signedUrl(bucket, p, expiresSec) {
      if (!objects.has(key(bucket, p))) throw new ObjectNotFoundError(bucket, p);
      return `memory://${bucket}/${p}?expiresIn=${expiresSec}`;
    },
    publicUrl(bucket, p) {
      return `memory://${bucket}/${p}`;
    },
    has(bucket, p) {
      return objects.has(key(bucket, p));
    },
    list(bucket) {
      const prefix = `${bucket}/`;
      return [...objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
        .sort();
    },
    contentType(bucket, p) {
      return objects.get(key(bucket, p))?.contentType;
    },
  };
}

// --- Local disk (dev) ---------------------------------------------------------------------

/** The URL prefix of the dev-only route that serves local storage. */
export const LOCAL_ROUTE = '/api/v1/media/local';

export type LocalTokenPurpose = 'upload' | 'read';

function localSignature(secret: string, purpose: LocalTokenPurpose, ref: string, expires: number) {
  return createHmac('sha256', secret)
    .update(`media-local\n${purpose}\n${ref}\n${expires}`)
    .digest('base64url');
}

/** `<expiresEpochSec>.<hmac>`: authorizes one purpose on one object until it expires. */
export function signLocalToken(
  secret: string,
  purpose: LocalTokenPurpose,
  bucket: Bucket,
  objectPath: string,
  expiresAtSec: number,
): string {
  return `${expiresAtSec}.${localSignature(secret, purpose, `${bucket}/${objectPath}`, expiresAtSec)}`;
}

export function verifyLocalToken(
  secret: string,
  purpose: LocalTokenPurpose,
  bucket: Bucket,
  objectPath: string,
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const [expiresText, sig] = token.split('.');
  const expires = Number(expiresText);
  if (!sig || !Number.isInteger(expires) || expires < nowSec) return false;
  const expected = Buffer.from(localSignature(secret, purpose, `${bucket}/${objectPath}`, expires));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type LocalStorageOptions = {
  /** The app's origin, for the URLs it hands out. Defaults to APP_URL. */
  baseUrl?: string;
  /** Signs upload and read tokens. Defaults to JOBS_SECRET (a server-only secret). */
  secret?: string;
};

/** Files on disk under `dir/<bucket>/<path>`. Development only. */
export function localStorage(dir: string, opts: LocalStorageOptions = {}): Storage {
  const root = path.resolve(dir);
  const baseUrl = () => (opts.baseUrl ?? getEnv().APP_URL).replace(/\/+$/, '');
  const secret = () => opts.secret ?? getEnv().JOBS_SECRET;
  const nowSec = () => Math.floor(Date.now() / 1000);

  const fileOf = (bucket: Bucket, p: string) => {
    assertSafe(bucket, p);
    const file = path.resolve(root, bucket, ...p.split('/'));
    if (!file.startsWith(root + path.sep)) throw new Error(`Unsafe object path: ${p}`);
    return file;
  };
  const urlOf = (bucket: Bucket, p: string) => `${baseUrl()}${LOCAL_ROUTE}/${bucket}/${p}`;
  const isMissing = (err: unknown) =>
    typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';

  return {
    async signedUploadUrl(bucket, p) {
      const token = signLocalToken(secret(), 'upload', bucket, p, nowSec() + UPLOAD_URL_TTL_SEC);
      return { url: `${urlOf(bucket, p)}?token=${encodeURIComponent(token)}`, token };
    },
    async read(bucket, p) {
      try {
        return new Uint8Array(await readFile(fileOf(bucket, p)));
      } catch (err) {
        if (isMissing(err)) throw new ObjectNotFoundError(bucket, p, { cause: err });
        throw err;
      }
    },
    async write(bucket, p, bytes) {
      const file = fileOf(bucket, p);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async copy(from, to) {
      const target = fileOf(to.bucket, to.path);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await copyFile(fileOf(from.bucket, from.path), target);
      } catch (err) {
        if (isMissing(err)) throw new ObjectNotFoundError(from.bucket, from.path, { cause: err });
        throw err;
      }
    },
    async remove(bucket, p) {
      await rm(fileOf(bucket, p), { force: true });
    },
    async signedUrl(bucket, p, expiresSec) {
      const token = signLocalToken(secret(), 'read', bucket, p, nowSec() + expiresSec);
      return `${urlOf(bucket, p)}?token=${encodeURIComponent(token)}`;
    },
    publicUrl(bucket, p) {
      return urlOf(bucket, p);
    },
  };
}

// --- Supabase -----------------------------------------------------------------------------

type StorageErrorLike = { message?: string; status?: number; statusCode?: string | number };

function errorStatus(error: StorageErrorLike): number | undefined {
  const raw = error.status ?? error.statusCode;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function isNotFound(error: StorageErrorLike): boolean {
  return errorStatus(error) === 404 || /not.?found/i.test(error.message ?? '');
}

function isDuplicate(error: StorageErrorLike): boolean {
  return errorStatus(error) === 409 || /already exists|duplicate/i.test(error.message ?? '');
}

function fail(op: string, bucket: string, p: string, error: StorageErrorLike): never {
  if (isNotFound(error)) throw new ObjectNotFoundError(bucket, p, { cause: error });
  throw new Error(`Storage ${op} failed for ${bucket}/${p}: ${error.message ?? 'unknown error'}`, {
    cause: error,
  });
}

export type SupabaseStorageOptions = { url?: string; serviceRoleKey?: string };

/** Supabase Storage with the service-role key. Server only; buckets are created by the runbook. */
export function supabaseStorage(opts: SupabaseStorageOptions = {}): Storage {
  let client: ReturnType<typeof createClient> | undefined;
  const bucketApi = (bucket: Bucket) => {
    if (!client) {
      const env = getEnv();
      const url = opts.url ?? env.SUPABASE_URL;
      const key = opts.serviceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Supabase storage needs SUPABASE_URL and the service key');
      client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return client.storage.from(bucket);
  };

  const remove = async (bucket: Bucket, p: string) => {
    const { error } = await bucketApi(bucket).remove([p]);
    if (error && !isNotFound(error)) fail('remove', bucket, p, error);
  };

  return {
    async signedUploadUrl(bucket, p) {
      assertSafe(bucket, p);
      const { data, error } = await bucketApi(bucket).createSignedUploadUrl(p);
      if (error) fail('signedUploadUrl', bucket, p, error);
      return { url: data.signedUrl, token: data.token };
    },
    async read(bucket, p) {
      const { data, error } = await bucketApi(bucket).download(p);
      if (error) fail('read', bucket, p, error);
      return new Uint8Array(await data.arrayBuffer());
    },
    async write(bucket, p, bytes, contentType) {
      assertSafe(bucket, p);
      const { error } = await bucketApi(bucket).upload(p, bytes, { contentType, upsert: true });
      if (error) fail('write', bucket, p, error);
    },
    async copy(from, to) {
      assertSafe(to.bucket, to.path);
      const api = bucketApi(from.bucket);
      const run = () => api.copy(from.path, to.path, { destinationBucket: to.bucket });
      let { error } = await run();
      if (error && isDuplicate(error)) {
        // Copy never overwrites; a retried job may find its own earlier copy in place.
        await remove(to.bucket, to.path);
        ({ error } = await run());
      }
      if (error) fail('copy', from.bucket, from.path, error);
    },
    remove,
    async signedUrl(bucket, p, expiresSec) {
      const { data, error } = await bucketApi(bucket).createSignedUrl(p, expiresSec);
      if (error) fail('signedUrl', bucket, p, error);
      return data.signedUrl;
    },
    publicUrl(bucket, p) {
      return bucketApi(bucket).getPublicUrl(p).data.publicUrl;
    },
  };
}

// --- The configured storage ---------------------------------------------------------------

let configured: { key: string; storage: Storage } | undefined;

/** The storage STORAGE_PROVIDER selects, created once per process. Server only. */
export function getStorage(): Storage {
  const env = getEnv();
  const key = `${env.STORAGE_PROVIDER}:${env.LOCAL_STORAGE_DIR}`;
  if (configured?.key !== key) {
    const storage =
      env.STORAGE_PROVIDER === 'supabase'
        ? supabaseStorage()
        : env.STORAGE_PROVIDER === 'local'
          ? localStorage(env.LOCAL_STORAGE_DIR)
          : memoryStorage();
    configured = { key, storage };
  }
  return configured.storage;
}
