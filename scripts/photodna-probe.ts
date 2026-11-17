// Staging probe for PhotoDNA. Doppler injects PHOTODNA_KEY into the environment.
// This script never prints the key, the request headers, or the image bytes.
// Run with CHILD_SAFETY_PROVIDER=photodna. If PHOTODNA_KEY is absent, it reports that
// and still shows that a rate-limit response fails closed.
import sharp from 'sharp';
import { photoDnaScanner } from '@/modules/media';

function say(line: string): void {
  const key = process.env.PHOTODNA_KEY;
  const redacted = key && key.length > 0 ? line.replaceAll(key, '[redacted]') : line;
  process.stdout.write(`${redacted}\n`);
}

async function benignPng(): Promise<Uint8Array> {
  const bytes = await sharp({
    create: { width: 160, height: 160, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  return new Uint8Array(bytes);
}

async function showRateLimitFailsClosed(png: Uint8Array): Promise<void> {
  const scanner = photoDnaScanner({
    key: 'not-printed',
    fetch: async () => new Response('busy', { status: 429 }),
  });
  try {
    const result = await scanner.scanImage(png);
    say(`error handling: unexpected result match=${result.match}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    say(`error handling: rate limit fails closed (${message})`);
  }
}

async function main(): Promise<void> {
  const png = await benignPng();
  await showRateLimitFailsClosed(png);

  const key = process.env.PHOTODNA_KEY;
  if (!key) {
    say(
      'PHOTODNA_KEY is not set. No live request was sent. Ask the founder to add PHOTODNA_KEY in Doppler.',
    );
    return;
  }

  try {
    const result = await photoDnaScanner({ key }).scanImage(png);
    say(`live probe: match=${result.match} provider=${result.provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    say(`live probe error: ${message}`);
  }
}

await main();
