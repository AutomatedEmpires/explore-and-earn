// The wrapper every /api/v1 route handler uses (spec section 4): request ids, the CSRF origin
// check, auth guards, zod input validation, rate limits and one error envelope.
//
//   export const POST = apiRoute({
//     auth: 'user',
//     input: z.object({ name: z.string() }),
//     rateLimit: { key: (ctx) => `things:${ctx.user?.id}`, limit: 60, windowSec: 3600 },
//     openapi: { method: 'POST', path: '/api/v1/things', summary: 'Create a thing', output },
//     handler: async ({ input, user, db }) => createThing(db, user, input),
//   });
import { captureException } from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { getDb, type Db } from '@/lib/db';
import { getEnv, type Env } from '@/lib/env';
import { AppError, badRequest, forbidden, isAppError, rateLimited } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { consume } from '@/lib/rate-limit';
import {
  requireHost,
  requireOperator,
  requireSeeker,
  requireUser,
  type CurrentUser,
  type HostContext,
  type OperatorContext,
} from './guards';
import { registerRoute } from './openapi';
import { REQUEST_ID_HEADER, requestIdFrom, runWithRequestContext } from './request-context';

export type AuthMode = 'none' | 'user' | 'seeker' | 'host' | 'operator';
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type ApiContext<I> = {
  input: I;
  requestId: string;
  db: Db;
  /** The signed-in user; null only when `auth` is 'none'. */
  user: CurrentUser | null;
  req: Request;
  /** Set when `auth` is 'host'. */
  host?: HostContext;
  /** Set when `auth` is 'operator'. */
  operator?: OperatorContext;
};

export type RateLimitOption<I> = {
  /** The bucket to count against, for example `uploads:${ctx.user?.id}`. */
  key: (ctx: ApiContext<I>) => string;
  limit: number;
  windowSec: number;
};

export type OpenApiOption<O> = {
  method: HttpMethod;
  /** The public path, with dynamic segments as `{name}`: `/api/v1/media/{id}`. */
  path: string;
  summary: string;
  output?: z.ZodType<O>;
};

export type ApiRouteOptions<I, O> = {
  /**
   * Validates the input: the query string for GET, otherwise the JSON body. Dynamic route
   * params (`[id]`) are merged in and win over body fields of the same name. Without a schema
   * the handler gets `undefined` and the body is left unread.
   */
  input?: z.ZodType<I>;
  /** Which guard runs before the handler. Defaults to 'none'. */
  auth?: AuthMode;
  /** Checked after auth and input validation, before the handler. */
  rateLimit?: RateLimitOption<I>;
  /** Documents the route in /api/v1/openapi.json. */
  openapi?: OpenApiOption<O>;
  /** Returns the JSON body (200), undefined (204), or a ready Response (for example a stream). */
  handler: (ctx: ApiContext<I>) => Promise<O>;
};

/** The second argument Next.js passes to a route handler. */
export type RouteContext = {
  params?: Promise<Record<string, string | string[] | undefined>>;
};

export type RouteHandler = (req: Request, route?: RouteContext) => Promise<Response>;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BODY_BYTES = 1024 * 1024;
const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

function baseHeaders(requestId: string): Headers {
  return new Headers({ [REQUEST_ID_HEADER]: requestId, 'cache-control': 'no-store' });
}

/**
 * The error envelope `{ error: { code, message, details?, requestId } }` for any thrown value.
 * AppErrors keep their status, message and details. Anything else is logged, sent to Sentry and
 * returned as a bare 500 `internal`, so internal messages never reach the caller.
 */
export function toErrorResponse(err: unknown, requestId: string): Response {
  let appError: AppError;
  if (isAppError(err)) {
    appError = err;
    if (appError.status >= 500) {
      logger.error('API error', { requestId, err });
      captureException(err, { tags: { requestId } });
    }
  } else {
    logger.error('Unhandled API error', { requestId, err });
    captureException(err, { tags: { requestId } });
    appError = new AppError('internal');
  }

  const error: { code: string; message: string; details?: unknown; requestId: string } = {
    code: appError.code,
    message: appError.message,
    requestId,
  };
  if (appError.details !== undefined) error.details = appError.details;
  return Response.json({ error }, { status: appError.status, headers: baseHeaders(requestId) });
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

/** The origins allowed to send state-changing requests: the app and the operator console. */
function allowedOrigins(env: Env): Set<string> {
  const origins = [originOf(env.APP_URL), originOf(`https://${env.ADMIN_HOST}`)];
  // Local dev serves the console over plain http.
  if (env.APP_ENV === 'dev') origins.push(originOf(`http://${env.ADMIN_HOST}`));
  return new Set(origins.filter((o): o is string => o !== null));
}

/** CSRF defense for cookie sessions: a state-changing request must come from our own pages. */
function checkOrigin(req: Request, env: Env): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin === null) {
    // Browsers send Origin on every non-GET request; a missing one means a non-browser client
    // (which carries no victim cookies), unless Fetch Metadata says it came from another site.
    const site = req.headers.get('sec-fetch-site');
    if (site !== null && site !== 'same-origin' && site !== 'none') {
      throw forbidden('Cross-site request blocked');
    }
    return;
  }
  if (!allowedOrigins(env).has(origin.toLowerCase())) {
    throw forbidden('Cross-origin request blocked');
  }
}

async function authenticate(
  mode: AuthMode,
): Promise<Pick<ApiContext<unknown>, 'user' | 'host' | 'operator'>> {
  switch (mode) {
    case 'none':
      return { user: null };
    case 'user':
      return { user: await requireUser() };
    case 'seeker':
      return { user: await requireSeeker() };
    case 'host': {
      const host = await requireHost();
      return { user: host.user, host };
    }
    case 'operator': {
      const operator = await requireOperator();
      return { user: operator.user, operator };
    }
  }
}

function queryObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? (values[0] ?? '') : values;
  }
  return out;
}

async function readBoundedText(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw badRequest('Request body is too large');
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw badRequest('Request body is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await readBoundedText(req);
  if (text.trim() === '') return {};
  if (!JSON_TYPE.test(req.headers.get('content-type') ?? '')) {
    throw badRequest('Expected a JSON body (Content-Type: application/json)');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('Request body is not valid JSON');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readInput<I>(
  req: Request,
  schema: z.ZodType<I>,
  params: Record<string, string | string[] | undefined>,
): Promise<I> {
  let raw: unknown = SAFE_METHODS.has(req.method)
    ? queryObject(new URL(req.url).searchParams)
    : await readJsonBody(req);
  if (Object.keys(params).length > 0 && isPlainObject(raw)) raw = { ...raw, ...params };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest('Invalid input', parsed.error.issues);
  return parsed.data;
}

function finish(result: unknown, requestId: string): Response {
  if (result instanceof Response) {
    const headers = new Headers(result.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  if (result === undefined)
    return new Response(null, { status: 204, headers: baseHeaders(requestId) });
  return Response.json(result, { status: 200, headers: baseHeaders(requestId) });
}

/** Wraps a route handler with the API conventions. See the example at the top of this file. */
export function apiRoute<I = undefined, O = unknown>(opts: ApiRouteOptions<I, O>): RouteHandler {
  const auth = opts.auth ?? 'none';
  if (opts.openapi) {
    const { method, path, summary, output } = opts.openapi;
    registerRoute({ method, path, summary, auth, input: opts.input, output });
  }

  return async (req, route) => {
    const requestId = requestIdFrom(req);
    const path = new URL(req.url).pathname;

    return runWithRequestContext({ requestId, method: req.method, path }, async () => {
      try {
        checkOrigin(req, getEnv());

        const who = await authenticate(auth);
        const params = (await route?.params) ?? {};
        const input = opts.input ? await readInput(req, opts.input, params) : (undefined as I);
        const ctx: ApiContext<I> = { input, requestId, db: getDb(), req, ...who };

        if (opts.rateLimit) {
          const { key, limit, windowSec } = opts.rateLimit;
          const verdict = await consume(ctx.db, key(ctx), limit, windowSec);
          if (!verdict.allowed) {
            const res = toErrorResponse(rateLimited(), requestId);
            const seconds = Math.max(1, Math.ceil((verdict.resetAt.getTime() - Date.now()) / 1000));
            res.headers.set('retry-after', String(seconds));
            return res;
          }
        }

        return finish(await opts.handler(ctx), requestId);
      } catch (err) {
        // Let Next.js handle its own control flow (redirect(), notFound() and friends).
        unstable_rethrow(err);
        return toErrorResponse(err, requestId);
      }
    });
  };
}
