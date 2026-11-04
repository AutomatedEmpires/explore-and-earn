export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  bad_request: 'Bad request',
  unauthorized: 'Sign in required',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  rate_limited: 'Too many requests',
  internal: 'Internal error',
};

/** An error that is safe to show to the caller. Anything else becomes a 500 `internal`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown, options?: ErrorOptions) {
    super(message ?? DEFAULT_MESSAGE[code], options);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (details !== undefined) this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export const badRequest = (message?: string, details?: unknown) =>
  new AppError('bad_request', message, details);
export const unauthorized = (message?: string, details?: unknown) =>
  new AppError('unauthorized', message, details);
export const forbidden = (message?: string, details?: unknown) =>
  new AppError('forbidden', message, details);
export const notFound = (message?: string, details?: unknown) =>
  new AppError('not_found', message, details);
export const conflict = (message?: string, details?: unknown) =>
  new AppError('conflict', message, details);
export const rateLimited = (message?: string, details?: unknown) =>
  new AppError('rate_limited', message, details);
