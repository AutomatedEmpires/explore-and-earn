// The EICAR antivirus test file, assembled at runtime. A fixture holding the string verbatim
// would be quarantined by the antivirus on developer machines (Windows Defender deletes it on
// checkout), so it only ever exists in memory.
export function eicarText(): string {
  return ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
}

/** A minimal valid PDF with the EICAR string in a comment. */
export function pdfWithEicar(): Uint8Array {
  const body = [
    '%PDF-1.4',
    `% ${eicarText()}`,
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
    '',
  ].join('\n');
  return new TextEncoder().encode(body);
}
