// The HTTP client SP4's screens and _features use (SP4 plan Task 6): JSON in and out, and the
// Foundation error envelope `{ error: { code, message, details? } }` thrown as ApiError, with
// `details.reason` (the SP4 case, such as `listing_changed`) lifted to `reason`. Client-safe.

export class ApiError extends Error {
  readonly status: number;
  /** The envelope's code (`conflict`, `bad_request`, ...); `network` when nothing came back. */
  readonly code: string;
  /** `details.reason` when the envelope has one. */
  readonly reason: string | null;
  readonly details: unknown;

  constructor(i: {
    status: number;
    code: string;
    message: string;
    reason: string | null;
    details: unknown;
  }) {
    super(i.message);
    this.name = 'ApiError';
    this.status = i.status;
    this.code = i.code;
    this.reason = i.reason;
    this.details = i.details;
  }
}

/** A relative path resolved against the page (or jsdom's) origin; absolute URLs pass through. */
function resolve(path: string): string {
  if (typeof location === 'undefined' || /^[a-z]+:/i.test(path)) return path;
  return new URL(path, location.origin).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorOf(status: number, body: unknown): ApiError {
  const envelope = isRecord(body) && isRecord(body.error) ? body.error : null;
  const details = envelope?.details;
  const reason = isRecord(details) && typeof details.reason === 'string' ? details.reason : null;
  return new ApiError({
    status,
    code: typeof envelope?.code === 'string' ? envelope.code : 'internal',
    message:
      typeof envelope?.message === 'string' ? envelope.message : `Request failed (${status})`,
    reason,
    details,
  });
}

/**
 * Calls the API and returns the parsed JSON (undefined for 204). `json` is sent as the body
 * with `Content-Type: application/json`. A non-2xx answer throws ApiError.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  h.set('accept', 'application/json');
  let body = rest.body;
  if (json !== undefined) {
    h.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }
  let res: Response;
  try {
    res = await fetch(resolve(path), { credentials: 'same-origin', ...rest, headers: h, body });
  } catch (err) {
    throw new ApiError({
      status: 0,
      code: 'network',
      message: err instanceof Error ? err.message : 'Network error',
      reason: null,
      details: undefined,
    });
  }
  const text = res.status === 204 ? '' : await res.text();
  let data: unknown = undefined;
  if (text !== '') {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) throw errorOf(res.status, data);
  return data as T;
}
