// generate(): Claude Sonnet 5.5 with PDF documents, structured output and server-side fallbacks
// (SP4 spec 3.4 and 9). The Anthropic tests run a real SDK client whose HTTP layer is faked, so
// the request body is exactly what would go on the wire.
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiError,
  generate,
  generateStub,
  generateWith,
  type AiContent,
  type GenerateOptions,
} from './ai';
import { resetEnvCache } from './env';

const Proposal = z.object({ headline: z.string(), skills: z.array(z.string()) });
type Proposal = z.infer<typeof Proposal>;

const STUB_ANSWER: Proposal = { headline: 'Deckhand', skills: ['Knots'] };

const text = (t: string): AiContent => ({ type: 'text', text: t });
const pdf = (marker = ''): AiContent => ({
  type: 'document',
  mime: 'application/pdf',
  // A PDF's Info dictionary carries Keywords as a literal string, so a marker there is plain bytes.
  bytes: new TextEncoder().encode(`%PDF-1.7\n1 0 obj << /Keywords (${marker}) >> endobj\n%%EOF`),
});

function opts(
  content: AiContent[],
  extra: Partial<GenerateOptions<Proposal>> = {},
): GenerateOptions<Proposal> {
  return {
    model: 'claude-sonnet-5-5',
    system: 'Read the resume.',
    content,
    schema: Proposal,
    promptVersion: 'resume_import@1',
    effort: 'medium',
    timeoutMs: 60_000,
    maxTokens: 8_000,
    stub: () => STUB_ANSWER,
    ...extra,
  };
}

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

/** A real SDK client whose HTTP layer answers with `respond`, recording each request. */
function fakeClient(
  respond: (init: RequestInit) => Promise<Response>,
  captured: Captured[] = [],
): Anthropic {
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return respond(init ?? {});
  };
  return new Anthropic({ apiKey: 'test-key', fetch: fetchImpl, maxRetries: 0 });
}

function messageResponse(content: unknown[], stopReason = 'end_turn'): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function kindOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AiError);
  return (err as AiError).kind;
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('generate with the stub provider', () => {
  it('returns the stub answer, validated by the schema', async () => {
    vi.stubEnv('AI_PROVIDER', 'stub');
    resetEnvCache();
    const stub = vi.fn(() => STUB_ANSWER);
    await expect(generate(opts([pdf(), text('Import this')], { stub }))).resolves.toEqual(
      STUB_ANSWER,
    );
    expect(stub).toHaveBeenCalledWith([pdf(), text('Import this')]);
  });

  it('fails with kind provider on __fail__ in text', async () => {
    expect(
      await kindOf(Promise.resolve().then(() => generateStub(opts([text('x __fail__ y')])))),
    ).toBe('provider');
  });

  it('fails with kind provider on __fail__ in document bytes (a PDF Keywords entry)', async () => {
    expect(await kindOf(Promise.resolve().then(() => generateStub(opts([pdf('__fail__')]))))).toBe(
      'provider',
    );
  });

  it('refuses with kind refusal on __refuse__ in text', async () => {
    expect(
      await kindOf(Promise.resolve().then(() => generateStub(opts([text('__refuse__')])))),
    ).toBe('refusal');
  });

  it('refuses with kind refusal on __refuse__ in document bytes', async () => {
    expect(
      await kindOf(Promise.resolve().then(() => generateStub(opts([pdf('__refuse__')])))),
    ).toBe('refusal');
  });

  it('gives kind schema when the stub value fails the schema', async () => {
    const bad = opts([text('x')], { stub: () => ({ headline: 3 }) as unknown as Proposal });
    expect(await kindOf(Promise.resolve().then(() => generateStub(bad)))).toBe('schema');
  });
});

describe('generateWith (Anthropic)', () => {
  it('sends the PDF first, with structured output, effort and server-side fallbacks', async () => {
    const captured: Captured[] = [];
    const client = fakeClient(
      async () =>
        messageResponse([
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: '{"headline":"Line cook","skills":["Prep"]}' },
        ]),
      captured,
    );
    const doc = pdf();

    const result = await generateWith(client, opts([text('Fill in the profile.'), doc]));

    expect(result).toEqual({ headline: 'Line cook', skills: ['Prep'] });
    const [request] = captured;
    if (!request) throw new Error('no request was sent');
    const body = request.body;
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(8_000);
    expect(body.system).toBe('Read the resume.');
    expect(body.fallbacks).toBe('default');
    expect(request.headers.get('anthropic-beta') ?? '').toContain(
      'server-side-fallback-2026-07-01',
    );
    const outputConfig = body.output_config as {
      effort: string;
      format: { type: string; schema: Record<string, unknown> };
    };
    expect(outputConfig.effort).toBe('medium');
    expect(outputConfig.format.type).toBe('json_schema');
    expect(outputConfig.format.schema).toMatchObject({ type: 'object' });
    expect(outputConfig.format.schema).not.toHaveProperty('$schema');
    for (const key of ['tool_choice', 'thinking', 'temperature', 'top_p']) {
      expect(body).not.toHaveProperty(key);
    }
    const [message] = body.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(message?.role).toBe('user');
    expect(message?.content[0]).toEqual({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from(doc.type === 'document' ? doc.bytes : []).toString('base64'),
      },
    });
    expect(message?.content[1]).toEqual({ type: 'text', text: 'Fill in the profile.' });
  });

  it('maps stop_reason refusal to kind refusal', async () => {
    const client = fakeClient(async () => messageResponse([], 'refusal'));
    expect(await kindOf(generateWith(client, opts([pdf()])))).toBe('refusal');
  });

  it('maps an answer that is not JSON to kind schema', async () => {
    const client = fakeClient(async () => messageResponse([{ type: 'text', text: 'not json' }]));
    expect(await kindOf(generateWith(client, opts([pdf()])))).toBe('schema');
  });

  it('maps a JSON answer that fails the schema to kind schema', async () => {
    const client = fakeClient(async () =>
      messageResponse([{ type: 'text', text: '{"headline":3}' }]),
    );
    expect(await kindOf(generateWith(client, opts([pdf()])))).toBe('schema');
  });

  it("maps the SDK's connection timeout to kind timeout", async () => {
    const client = fakeClient(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    expect(await kindOf(generateWith(client, opts([pdf()])))).toBe('timeout');
  });

  it('gives up after timeoutMs with kind timeout', async () => {
    const hanging = fakeClient(
      (init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    expect(await kindOf(generateWith(hanging, opts([pdf()], { timeoutMs: 50 })))).toBe('timeout');
  });

  it('maps an InternalServerError to kind provider', async () => {
    const client = fakeClient(
      async () =>
        new Response(
          JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Boom' } }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
    );
    const err = await generateWith(client, opts([pdf()])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('provider');
    expect((err as AiError).cause).toBeInstanceOf(Anthropic.InternalServerError);
  });

  it('never puts the content in an error message', async () => {
    const client = fakeClient(async () =>
      messageResponse([{ type: 'text', text: '{"headline":"Secret Person"}' }]),
    );
    const err = await generateWith(client, opts([text('Secret Person, 555-0100')])).catch(
      (e: unknown) => e,
    );
    expect(String((err as Error).message)).not.toContain('Secret Person');
    expect(String((err as Error).message)).not.toContain('555-0100');
  });
});
