// Errors carry ids, not personal data (spec section 13). Drizzle wraps every failed query in a
// DrizzleQueryError whose message is `Failed query: <sql>\nparams: <params>`, and the params are
// often an email, a name or a notification's text. Everything that copies an error's message
// somewhere lasting (logs, Sentry, app.outbox.last_error) passes the error through here first.
//
// No imports: the browser's Sentry config (sentry.shared.ts) uses this file too.

/**
 * Drizzle's `\nparams: <values>`. The values may contain newlines themselves, so it runs to the
 * end of a message, or in a stack to the first frame.
 */
const PARAMS = /\r?\nparams: [\s\S]*?(?=\r?\n\s+at |$)/g;

/**
 * `text` (a message, or a stack, also one that quotes the query error inside a message of its
 * own) without the parameter values drizzle appends to a failed query.
 */
export function stripQueryParams(text: string): string {
  return text.replace(PARAMS, '');
}

type QueryError = Error & { query: string; params: unknown };

function isQueryError(err: Error): err is QueryError {
  return (
    'query' in err &&
    typeof err.query === 'string' &&
    'params' in err &&
    /^Failed query: /.test(err.message)
  );
}

/** Only the database's own verdict (name, message and SQLSTATE code), none of its details. */
function databaseCause(cause: unknown): unknown {
  if (!(cause instanceof Error)) return cause;
  const out = new Error(stripQueryParams(cause.message));
  out.name = cause.name;
  if ('code' in cause && (typeof cause.code === 'string' || typeof cause.code === 'number')) {
    Object.assign(out, { code: cause.code });
  }
  out.stack = `${out.name}: ${out.message}`;
  return out;
}

/** The stack's frames (`    at ...` lines), without the message it starts with. */
function frames(stack: string | undefined): string {
  if (!stack) return '';
  const lines = stack.split('\n');
  const first = lines.findIndex((line) => /^\s+at /.test(line));
  return first === -1 ? '' : `\n${lines.slice(first).join('\n')}`;
}

/**
 * The error to log or report in place of `err`: for a failed drizzle query, a copy that keeps
 * the SQL text, the stack and the database error's code and message, and drops the parameter
 * values. Anything else is returned unchanged.
 */
export function scrubError<T>(err: T): T | Error {
  if (!(err instanceof Error) || !isQueryError(err)) return err;
  const clean = new Error(`Failed query: ${err.query}`);
  clean.name = err.name === 'Error' ? 'DrizzleQueryError' : err.name;
  clean.stack = `${clean.name}: ${clean.message}${frames(err.stack)}`;
  if (err.cause !== undefined) clean.cause = databaseCause(err.cause);
  return clean;
}

/** The parts of a Sentry event that can quote an error message. */
type SentryEventText = {
  message?: string;
  exception?: { values?: { value?: string }[] };
  logentry?: { message?: string; formatted?: string };
};

/**
 * Sentry's `beforeSend`: drops a failed query's parameters from the event's message and every
 * exception value (linked causes included), whatever path the error took to get there.
 */
export function scrubSentryEvent<E extends SentryEventText>(event: E): E {
  if (typeof event.message === 'string') event.message = stripQueryParams(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = stripQueryParams(ex.value);
  }
  if (event.logentry) {
    if (typeof event.logentry.message === 'string') {
      event.logentry.message = stripQueryParams(event.logentry.message);
    }
    if (typeof event.logentry.formatted === 'string') {
      event.logentry.formatted = stripQueryParams(event.logentry.formatted);
    }
  }
  return event;
}

/** An error's message as it may be stored (app.outbox.last_error): never a query's params. */
export function safeErrorMessage(err: unknown): string {
  const clean = scrubError(err);
  return clean instanceof Error ? stripQueryParams(clean.message) : stripQueryParams(String(clean));
}
