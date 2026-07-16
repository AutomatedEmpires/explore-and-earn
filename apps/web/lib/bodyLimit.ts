/**
 * Byte-accurate request-body caps.
 *
 * Extracted from the assistant route so every public POST sink shares the same
 * hardening: the cap is enforced on the ACTUAL bytes read from the stream — NOT
 * on the client-supplied Content-Length header (which is trivially spoofed or
 * omitted entirely with chunked transfer encoding).
 */

/**
 * Read a request body with a HARD byte cap enforced on the actual bytes read —
 * NOT on the client-supplied Content-Length header (which is trivially spoofed
 * or omitted with chunked transfer encoding). Aborts as soon as the accumulated
 * chunks exceed `maxBytes`, so an attacker can never stream an unbounded body
 * into memory. Returns null when the cap is exceeded or the body can't be read.
 */
export async function readCappedBodyText(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  const body = req.body;
  if (!body) {
    // No stream (e.g. some runtimes): fall back to text() but still cap after.
    try {
      const text = await req.text();
      return byteLength(text) > maxBytes ? null : text;
    } catch {
      return null;
    }
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
