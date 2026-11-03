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
      const out: Fields = { name: value.name, message: value.message, stack: value.stack };
      if ('code' in value) out.code = value.code;
      if (value.cause !== undefined) out.cause = value.cause;
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

/** Structured logger: one JSON line per call. Keys that look like secrets are redacted. */
export const logger = {
  info: (msg: string, fields?: Fields): void => write('info', msg, fields),
  warn: (msg: string, fields?: Fields): void => write('warn', msg, fields),
  error: (msg: string, fields?: Fields): void => write('error', msg, fields),
};
