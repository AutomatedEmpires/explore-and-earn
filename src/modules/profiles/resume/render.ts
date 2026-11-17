// Renders a profile snapshot as a resume PDF (SP4 spec 8.8): pdfkit, Letter, Figtree embedded,
// tagged. W0 stub: W2 implements it (Task 13).
import type { ProfileSnapshotV1, ResumeTemplate } from '@/lib/profiles';

/** Byte-stable for a fixed `creationDate`. */
export async function renderResumePdf(
  _snapshot: ProfileSnapshotV1,
  _template: ResumeTemplate,
  _opts?: { creationDate?: Date },
): Promise<Uint8Array> {
  throw new Error('not implemented: renderResumePdf');
}
