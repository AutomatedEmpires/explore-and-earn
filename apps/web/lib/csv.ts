/**
 * CSV serialisation for workspace exports (V2 D25).
 *
 * Small on purpose. The one thing a hand-rolled CSV writer usually gets wrong
 * is quoting, and it gets it wrong silently: a listing titled
 * `Dock Crew, Evenings` splits into two columns in every spreadsheet that opens
 * it, and the export looks fine to whoever wrote it. So escaping is the whole
 * job here, and it is unit-tested rather than eyeballed.
 *
 * RFC 4180 rules applied: a field is quoted when it contains a comma, a double
 * quote, CR or LF; an embedded double quote is doubled. CRLF terminates rows,
 * because Excel on Windows is the overwhelmingly likely destination.
 */

const NEEDS_QUOTING = /[",\r\n]/;

/** One field, escaped. `null`/`undefined` become an empty field, not "null". */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/** A full document: header row then data rows, CRLF-terminated throughout. */
export function buildCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly (string | number | null | undefined)[]>,
): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Hand a CSV to the browser as a download.
 *
 * A data: URL would be simpler and is what most snippets reach for, but it caps
 * out around a couple of megabytes in some browsers and fails without an error
 * — an export that silently produces nothing is worse than no export button.
 * The object URL is revoked on the next frame; revoking synchronously races the
 * click in WebKit.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // The BOM is what makes Excel read the file as UTF-8 rather than as the
  // system code page, which is how an accented name becomes mojibake. Written
  // as an escape rather than as the literal character: an invisible U+FEFF in
  // a source file is both an ESLint irregular-whitespace error and a thing no
  // reviewer can see.
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
