// PDF files for SP4 tests (SP4 plan Task 6): a real PDF built with pdfkit, so the import job's
// page count and "unreadable" checks run against the same library output as production.
// A stub-provider marker (`__fail__`, `__refuse__`) goes in the Info dictionary's Keywords,
// where generate()'s stub finds it in the bytes (compression never touches the Info entry).
import PDFDocument from 'pdfkit';

const FIXED_DATE = new Date('2026-11-03T17:00:00Z');

/** A Letter-size PDF with `lines` on its first page and `pages` pages in all (default 1). */
export function makePdf(i: {
  lines: string[];
  pages?: number;
  keywords?: string;
}): Promise<Uint8Array> {
  const pages = Math.max(1, i.pages ?? 1);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      info: {
        Title: 'Resume',
        CreationDate: FIXED_DATE,
        ModDate: FIXED_DATE,
        ...(i.keywords !== undefined ? { Keywords: i.keywords } : {}),
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.fontSize(12);
    for (const line of i.lines) doc.text(line);
    for (let n = 2; n <= pages; n++) doc.addPage().text(`Page ${n}`);
    doc.end();
  });
}
