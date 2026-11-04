// Per-request context: the request id (set by the proxy, echoed in every response, logged and
// sent to Sentry) and helpers to read the caller's address. Server only (Node.js runtime).
import { AsyncLocalStorage } from 'node:async_hooks';
import { newId } from '@/lib/ids';

export const REQUEST_ID_HEADER = 'x-request-id';

/** What we accept as an incoming request id: no spaces or control characters, bounded length. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export type RequestContext = {
  requestId: string;
  method?: string;
  path?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function isValidRequestId(value: string | null | undefined): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

/**
 * The request's id: the `x-request-id` the proxy assigned when it is well-formed, otherwise a
 * new UUIDv7. (The proxy always overwrites a client-sent value before the request gets here.)
 */
export function requestIdFrom(req: Request): string {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  return isValidRequestId(incoming) ? incoming : newId();
}

/** Runs `fn` with `ctx` available to everything it calls through `getRequestContext()`. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The current request's id, for logs and audit events deep inside a request. */
export function getRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}

/**
 * The caller's IP address as reported by the platform (Vercel sets `x-forwarded-for`), or null.
 * Use it for rate-limit keys and hashed audit fields, never for authorization.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}
