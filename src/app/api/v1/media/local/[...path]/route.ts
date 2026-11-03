// Serves the local-disk storage adapter (STORAGE_PROVIDER=local), development only:
//   GET /api/v1/media/local/<bucket>/<path>            public bucket: open; others: ?token=
//   PUT /api/v1/media/local/quarantine/<id>?token=...  the signed upload from requestUpload
// Everywhere else (any other provider, or APP_ENV=prod) it is a 404.
import { getEnv } from '@/lib/env';
import {
  BUCKETS,
  isSafeObjectPath,
  KIND_RULES,
  localStorage,
  ObjectNotFoundError,
  verifyLocalToken,
  type Bucket,
} from '@/modules/media';

type Params = { params: Promise<{ path: string[] }> };

const MAX_UPLOAD_BYTES = Math.max(...Object.values(KIND_RULES).map((r) => r.maxBytes));

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** The enabled adapter and the object the URL names, or null for a 404. */
async function resolve(
  route: Params,
): Promise<{ bucket: Bucket; objectPath: string; dir: string } | null> {
  const env = getEnv();
  if (env.APP_ENV === 'prod' || env.STORAGE_PROVIDER !== 'local') return null;
  const [bucket, ...rest] = (await route.params).path;
  const objectPath = rest.join('/');
  if (!bucket || !(BUCKETS as readonly string[]).includes(bucket)) return null;
  if (!isSafeObjectPath(objectPath)) return null;
  return { bucket: bucket as Bucket, objectPath, dir: env.LOCAL_STORAGE_DIR };
}

function tokenOf(req: Request): string {
  return new URL(req.url).searchParams.get('token') ?? '';
}

export async function GET(req: Request, route: Params): Promise<Response> {
  const target = await resolve(route);
  if (!target) return text(404, 'Not found');
  const { bucket, objectPath, dir } = target;

  const isPublic = bucket === 'media-public';
  if (
    !isPublic &&
    !verifyLocalToken(getEnv().JOBS_SECRET, 'read', bucket, objectPath, tokenOf(req))
  ) {
    return text(403, 'Forbidden');
  }

  try {
    const bytes = await localStorage(dir).read(bucket, objectPath);
    const ext = objectPath.split('.').pop()?.toLowerCase() ?? '';
    const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const headers: Record<string, string> = {
      'content-type': type,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': isPublic ? 'public, max-age=3600' : 'private, no-store',
    };
    if (!type.startsWith('image/')) headers['content-disposition'] = 'attachment';
    return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers });
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return text(404, 'Not found');
    throw err;
  }
}

export async function PUT(req: Request, route: Params): Promise<Response> {
  const target = await resolve(route);
  if (!target) return text(404, 'Not found');
  const { bucket, objectPath, dir } = target;

  if (
    bucket !== 'quarantine' ||
    !verifyLocalToken(getEnv().JOBS_SECRET, 'upload', bucket, objectPath, tokenOf(req))
  ) {
    return text(403, 'Forbidden');
  }
  if (Number(req.headers.get('content-length') ?? '0') > MAX_UPLOAD_BYTES) {
    return text(413, 'Too large');
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return text(413, 'Too large');
  const type = req.headers.get('content-type') ?? 'application/octet-stream';
  await localStorage(dir).write(bucket, objectPath, bytes, type);
  return Response.json({ key: `${bucket}/${objectPath}` });
}
