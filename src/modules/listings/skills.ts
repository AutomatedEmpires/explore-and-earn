// Skills are free text on listings and profiles; SP4 and SP5 compare them by key.

/**
 * `label`: NFKC-normalized, trimmed, inner whitespace collapsed. `key`: the label lowercased,
 * `&` spelled `and`, and every run of characters other than `a-z 0-9 + #` turned into one `-`,
 * trimmed of `-` ("C++" keeps its key "c++").
 */
export function normalizeSkill(label: string): { key: string; label: string } {
  const clean = label.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const key = clean
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9+#]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return { key, label: clean };
}
