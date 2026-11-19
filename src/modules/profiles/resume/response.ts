// The HTTP response for a resume PDF (SP4 spec 8.8 and 10): `Cache-Control: private, no-store`
// and `First-Last-resume.pdf` with an ASCII fallback plus `filename*`.

/** NFKD, drop combining marks, then drop anything that is still outside ASCII. */
function asciiFilename(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\u0020-\u007e]/g, '');
}

export function resumePdfResponse(
  bytes: Uint8Array,
  s: { firstName: string; lastName: string },
): Response {
  const utf8 = `${s.firstName}-${s.lastName}-resume.pdf`;
  const ascii = asciiFilename(utf8);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`,
    },
  });
}
