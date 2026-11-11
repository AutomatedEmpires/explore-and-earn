// The HTTP response for a resume PDF (SP4 spec 8.8 and 10): `Cache-Control: private, no-store`
// and `First-Last-resume.pdf` with an ASCII fallback plus `filename*`. W0 stub: W2 implements it
// (Task 14).

export function resumePdfResponse(
  _bytes: Uint8Array,
  _s: { firstName: string; lastName: string },
): Response {
  throw new Error('not implemented: resumePdfResponse');
}
