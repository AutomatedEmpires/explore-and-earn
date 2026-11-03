// Claude classifier: one structured-output Messages API call that returns a value matching a zod
// schema, or throws a ClassifierError. Callers (trust.runCheck) treat any throw as "needs a
// human", so this module never guesses: no retry past the deadline, no partial answers.
//
// AI_PROVIDER=stub answers from markers in the content instead of calling the API (dev, preview
// and tests): `__block__` scores 0.95, `__flag__` 0.5, anything else 0.02.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getEnv } from './env';

/** The only model Foundation uses for moderation and classification. */
export const CLASSIFIER_MODEL = 'claude-haiku-5-5';

export const DEFAULT_CLASSIFY_TIMEOUT_MS = 15_000;

/**
 * Room for adaptive thinking plus a short JSON answer. Claude Haiku 5.5 thinks by default and
 * thinking counts toward max_tokens, so a cap sized for the JSON alone would truncate it.
 */
const MAX_TOKENS = 2_048;

export type ClassifyContent =
  { type: 'text'; text: string } | { type: 'image'; mime: string; bytes: Uint8Array };

export type ClassifyOptions<T> = {
  model: typeof CLASSIFIER_MODEL;
  system: string;
  content: ClassifyContent[];
  schema: z.ZodType<T>;
  /** Stored with every result (trust_checks.prompt_version), e.g. `text_safety@1`. */
  promptVersion: string;
  /** The whole call, retries included, must finish within this. Default 15,000 ms. */
  timeoutMs?: number;
};

export type ClassifierErrorKind =
  'timeout' | 'api_error' | 'refusal' | 'truncated' | 'invalid_output' | 'unsupported_input';

/** Every way classify() can fail. The message never contains the classified content. */
export class ClassifierError extends Error {
  readonly kind: ClassifierErrorKind;

  constructor(kind: ClassifierErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ClassifierError';
    this.kind = kind;
  }
}

/** Image types the Messages API reads. Anything else (HEIC, SVG) fails closed. */
const API_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ApiImageType = (typeof API_IMAGE_TYPES)[number];

function isApiImageType(mime: string): mime is ApiImageType {
  return (API_IMAGE_TYPES as readonly string[]).includes(mime);
}

// --- Stub provider ----------------------------------------------------------------------------

const BLOCK_MARKER = '__block__';
const FLAG_MARKER = '__flag__';

function contentHas(content: ClassifyContent[], marker: string): boolean {
  return content.some((c) =>
    c.type === 'text' ? c.text.includes(marker) : Buffer.from(c.bytes).includes(marker),
  );
}

/**
 * The stub classifier. Scores by marker (in text, or anywhere in an image's bytes), always with
 * `labels: []` and `reason: 'stub'`, plus `altText: 'Test image'` when the content has an
 * image. The answer is validated against `schema` like a real one.
 */
export function classifyStub<T>(opts: ClassifyOptions<T>): T {
  const score = contentHas(opts.content, BLOCK_MARKER)
    ? 0.95
    : contentHas(opts.content, FLAG_MARKER)
      ? 0.5
      : 0.02;
  const hasImage = opts.content.some((c) => c.type === 'image');
  const answer = {
    score,
    labels: [],
    reason: 'stub',
    ...(hasImage ? { altText: 'Test image' } : {}),
  };
  return validate(opts.schema, answer);
}

// --- Anthropic provider -----------------------------------------------------------------------

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ClassifierError(
      'invalid_output',
      `Classifier output does not match the schema: ${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

function toContentBlocks(content: ClassifyContent[]): Anthropic.ContentBlockParam[] {
  return content.map((c): Anthropic.ContentBlockParam => {
    if (c.type === 'text') return { type: 'text', text: c.text };
    if (!isApiImageType(c.mime)) {
      throw new ClassifierError('unsupported_input', `Image type ${c.mime} cannot be classified`);
    }
    return {
      type: 'image',
      source: { type: 'base64', media_type: c.mime, data: Buffer.from(c.bytes).toString('base64') },
    };
  });
}

function wrapApiError(err: unknown, timedOut: boolean): ClassifierError {
  if (err instanceof ClassifierError) return err;
  if (timedOut || err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ClassifierError('timeout', 'Classifier timed out', { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status === undefined ? '' : ` (HTTP ${err.status})`;
    return new ClassifierError('api_error', `Classifier request failed${status}`, { cause: err });
  }
  return new ClassifierError('api_error', 'Classifier request failed', { cause: err });
}

/**
 * Classifies with a given Anthropic client: one Messages API call with structured output
 * (`output_config.format`, a JSON schema built from `schema`), validated again with zod.
 * Throws ClassifierError on a timeout, an API error, a refusal, a truncated answer or an
 * answer that doesn't match the schema.
 */
export async function classifyWith<T>(client: Anthropic, opts: ClassifyOptions<T>): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CLASSIFY_TIMEOUT_MS;
  const content = toContentBlocks(opts.content);
  if (content.length === 0) throw new ClassifierError('unsupported_input', 'Nothing to classify');

  // One deadline for the whole call, including the SDK's own retries.
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ClassifierError('timeout', `Classifier timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    const message = await Promise.race([
      client.messages.create(
        {
          model: opts.model,
          max_tokens: MAX_TOKENS,
          system: opts.system,
          messages: [{ role: 'user', content }],
          // Classification needs little reasoning; low effort keeps it fast and cheap.
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: zodOutputFormat(opts.schema).schema },
          },
        },
        { signal: controller.signal, timeout: timeoutMs },
      ),
      deadline,
    ]);

    if (message.stop_reason === 'refusal') {
      throw new ClassifierError('refusal', 'Classifier declined the request');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ClassifierError('truncated', 'Classifier answer was cut off');
    }
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new ClassifierError('invalid_output', 'Classifier answer is not JSON', { cause: err });
    }
    return validate(opts.schema, json);
  } catch (err) {
    throw wrapApiError(err, timedOut);
  } finally {
    clearTimeout(timer);
  }
}

let client: Anthropic | undefined;

function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY ?? null });
  return client;
}

/**
 * Classifies `content` with Claude and returns an answer matching `schema`, or throws
 * (ClassifierError) on any failure. Uses the provider in AI_PROVIDER. Server only.
 */
export async function classify<T>(opts: ClassifyOptions<T>): Promise<T> {
  if (getEnv().AI_PROVIDER === 'stub') return classifyStub(opts);
  return classifyWith(anthropic(), opts);
}
