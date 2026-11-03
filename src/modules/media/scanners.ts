// Child-safety and malware scanners behind swappable adapters (spec section 7). The stubs are
// for dev, preview and tests; APP_ENV=prod refuses to start with them (src/lib/env.ts).
// Every real scanner fails closed: an error or an unexpected answer throws, so the scan job
// retries and the file stays unreadable.
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { getEnv } from '@/lib/env';

export interface ChildSafetyScanner {
  scanImage(bytes: Uint8Array): Promise<{ match: boolean; provider: string; reference?: string }>;
}

export interface MalwareScanner {
  scanFile(bytes: Uint8Array, filename: string): Promise<{ clean: boolean; threat?: string }>;
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function parseHashes(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h !== '');
}

/**
 * Matches when the image's sha256 is in `hashes`, or (by default) in the comma-separated
 * CHILD_SAFETY_STUB_HASHES, read on every call.
 */
export function stubChildSafetyScanner(hashes?: Iterable<string>): ChildSafetyScanner {
  const fixed = hashes ? new Set([...hashes].map((h) => h.toLowerCase())) : null;
  return {
    async scanImage(bytes) {
      const known = fixed ?? new Set(parseHashes(getEnv().CHILD_SAFETY_STUB_HASHES));
      const hash = sha256(bytes);
      return known.has(hash)
        ? { match: true, provider: 'stub', reference: `sha256:${hash}` }
        : { match: false, provider: 'stub' };
    },
  };
}

// Assembled at runtime so no source file carries the EICAR signature verbatim (antivirus on
// developer machines would quarantine the file).
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(
  '',
);

/** Flags any file that contains the EICAR test string. */
export function stubMalwareScanner(): MalwareScanner {
  const needle = Buffer.from(EICAR, 'latin1');
  return {
    async scanFile(bytes) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(needle)
        ? { clean: false, threat: 'EICAR-Test-File' }
        : { clean: true };
    },
  };
}

type FetchLike = typeof fetch;

const TIMEOUT_MS = 30_000;

async function readJson(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${what} responded ${res.status}`);
  }
  return (await res.json()) as unknown;
}

// PhotoDNA Cloud Service (Microsoft). Verify the request against the developer portal
// (developer.microsoftmoderator.com) once the founder's application is approved.
const photoDnaResponse = z.object({
  Status: z.object({ Code: z.number(), Description: z.string().nullish() }),
  IsMatch: z.boolean(),
  TrackingId: z.string().nullish(),
});
const PHOTODNA_OK = 3000;
const PHOTODNA_FORMATS = new Set(['jpeg', 'png', 'gif', 'tiff']);

export type PhotoDnaOptions = { key?: string; endpoint?: string; fetch?: FetchLike };

export function photoDnaScanner(opts: PhotoDnaOptions = {}): ChildSafetyScanner {
  const endpoint = (opts.endpoint ?? 'https://api.microsoftmoderator.com').replace(/\/+$/, '');
  return {
    async scanImage(bytes) {
      const key = opts.key ?? getEnv().PHOTODNA_KEY;
      if (!key) throw new Error('PHOTODNA_KEY is not set');

      // PhotoDNA hashes are robust to re-encoding; send formats it reads as they are.
      const format = (await sharp(bytes).metadata()).format;
      const body =
        format && PHOTODNA_FORMATS.has(format) ? bytes : await sharp(bytes).png().toBuffer();

      const res = await (opts.fetch ?? fetch)(`${endpoint}/photodna/v1.0/Match?enhance=false`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Ocp-Apim-Subscription-Key': key },
        body: JSON.stringify({
          DataRepresentation: 'inline',
          Value: Buffer.from(body).toString('base64'),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const parsed = photoDnaResponse.parse(await readJson(res, 'PhotoDNA'));
      if (parsed.Status.Code !== PHOTODNA_OK) {
        throw new Error(
          `PhotoDNA status ${parsed.Status.Code}: ${parsed.Status.Description ?? ''}`,
        );
      }
      const reference = parsed.TrackingId ?? undefined;
      return reference
        ? { match: parsed.IsMatch, provider: 'photodna', reference }
        : { match: parsed.IsMatch, provider: 'photodna' };
    },
  };
}

// Cloudmersive Virus Scan API: POST /virus/scan/file (multipart `inputFile`, header Apikey).
const cloudmersiveResponse = z.object({
  CleanResult: z.boolean(),
  FoundViruses: z
    .array(z.object({ FileName: z.string().nullish(), VirusName: z.string().nullish() }))
    .nullish(),
});

export type CloudmersiveOptions = { apiKey?: string; endpoint?: string; fetch?: FetchLike };

export function cloudmersiveScanner(opts: CloudmersiveOptions = {}): MalwareScanner {
  const endpoint = (opts.endpoint ?? 'https://api.cloudmersive.com').replace(/\/+$/, '');
  return {
    async scanFile(bytes, filename) {
      const apiKey = opts.apiKey ?? getEnv().CLOUDMERSIVE_API_KEY;
      if (!apiKey) throw new Error('CLOUDMERSIVE_API_KEY is not set');

      const form = new FormData();
      form.append('inputFile', new Blob([new Uint8Array(bytes)]), filename);
      const res = await (opts.fetch ?? fetch)(`${endpoint}/virus/scan/file`, {
        method: 'POST',
        headers: { Apikey: apiKey },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const parsed = cloudmersiveResponse.parse(await readJson(res, 'Cloudmersive'));
      if (parsed.CleanResult) return { clean: true };
      const threat = parsed.FoundViruses?.find((v) => v.VirusName)?.VirusName ?? 'unknown';
      return { clean: false, threat };
    },
  };
}

/** The child-safety scanner CHILD_SAFETY_PROVIDER selects. */
export function getChildSafetyScanner(): ChildSafetyScanner {
  return getEnv().CHILD_SAFETY_PROVIDER === 'photodna'
    ? photoDnaScanner()
    : stubChildSafetyScanner();
}

/** The malware scanner MALWARE_PROVIDER selects. */
export function getMalwareScanner(): MalwareScanner {
  return getEnv().MALWARE_PROVIDER === 'cloudmersive'
    ? cloudmersiveScanner()
    : stubMalwareScanner();
}
