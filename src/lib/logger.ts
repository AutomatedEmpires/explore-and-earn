import { getRequestId } from '@/server/request-context';
import { scrubError, stripQueryParams } from './scrub';

export { scrubError, stripQueryParams } from './scrub';

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const RESERVED = new Set(['level', 'time', 'msg']);
const SECRET_KEY = /secret|token|password|api[_-]?key|authorization|cookie/i;

function serialize(record: Fields): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(record, (key, value: unknown) => {
    if (key !== '' && SECRET_KEY.test(key)) return '[redacted]';
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Error) {
      // A failed query's parameters (emails, names) never reach a log line.
      const err = scrubError(value);
      const out: Fields = {
        name: err.name,
        message: stripQueryParams(err.message),
        stack: err.stack === undefined ? undefined : stripQueryParams(err.stack),
      };
      if ('code' in err) out.code = err.code;
      if (err.cause !== undefined) out.cause = err.cause;
      return out;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

function write(level: Level, msg: string, fields?: Fields): void {
  const record: Fields = { level, time: new Date().toISOString(), msg };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      record[RESERVED.has(key) ? `field_${key}` : key] = value;
    }
  }
  // Every line written while handling a request carries its id (spec section 4), so a log from
  // deep inside a module can be tied to the API request that caused it.
  if (record.requestId === undefined || record.requestId === null) {
    const requestId = getRequestId();
    if (requestId) record.requestId = requestId;
  }

  let line: string;
  try {
    line = serialize(record);
  } catch {
    line = JSON.stringify({ level, time: record.time, msg, serializeError: true });
  }

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Structured logger: one JSON line per call, with the current request's id. Keys that look like
 * secrets are redacted, and a failed query's parameters are dropped.
 */
export const logger = {
  info: (msg: string, fields?: Fields): void => write('info', msg, fields),
  warn: (msg: string, fields?: Fields): void => write('warn', msg, fields),
  error: (msg: string, fields?: Fields): void => write('error', msg, fields),
};
