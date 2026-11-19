// Renders a profile snapshot as a resume PDF (SP4 spec 8.8): pdfkit, Letter, Figtree embedded,
// tagged. Byte-stable for a fixed creationDate. A template change after the goldens are
// committed must ship as a new TEMPLATES key (classic@2), never by editing classic@1.
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { ProfileSnapshotV1, ResumeTemplate } from '@/lib/profiles';
import { classicTemplate } from './classic';
import { compactTemplate } from './compact';
import type { ResumeDoc, TemplateStyle } from './layout';

export type TemplateSpec = TemplateStyle & {
  draw(doc: ResumeDoc, snapshot: ProfileSnapshotV1): void;
};

/** The generated templates. Keys are only ever added. */
export const TEMPLATES: Record<ResumeTemplate, TemplateSpec> = {
  'classic@1': classicTemplate,
  'compact@1': compactTemplate,
};

function fontFile(name: string): string {
  return path.join(process.cwd(), 'src/modules/profiles/resume/fonts', name);
}

/** Byte-stable when `creationDate` is set. The live download omits it. */
export function renderResumePdf(
  snapshot: ProfileSnapshotV1,
  template: ResumeTemplate,
  opts?: { creationDate?: Date },
): Promise<Uint8Array> {
  const spec = TEMPLATES[template];
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      pdfVersion: '1.7',
      tagged: true,
      lang: 'en-US',
      displayTitle: true,
      margin: 54,
      info: {
        Title: `${snapshot.firstName} ${snapshot.lastName} resume`,
        CreationDate: opts?.creationDate ?? new Date(),
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    try {
      doc.registerFont('Figtree', fontFile('Figtree-Regular.ttf'));
      doc.registerFont('Figtree-SemiBold', fontFile('Figtree-SemiBold.ttf'));
      spec.draw(doc, snapshot);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Could not render the resume'));
    }
  });
}
