// The privacy policy's retention table (Plan decision 25), generated from the registered
// retention rules when the policy's draft is saved, so a published version never changes
// underneath its readers.
import type { RetentionRule } from '@/modules/privacy';

const SPLIT = / (are|is) deleted /;

function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * A Markdown table with the header `| What we delete | When |`, one row per rule sorted by key.
 * Each description is split at its first " are deleted " or " is deleted "; a description with
 * neither goes whole in the first column.
 */
export function renderRetentionTable(
  rules: readonly Pick<RetentionRule, 'key' | 'description'>[],
): string {
  const rows = [...rules]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((rule) => {
      const match = SPLIT.exec(rule.description);
      const what = match ? rule.description.slice(0, match.index) : rule.description;
      const when = match ? rule.description.slice(match.index + match[0].length) : '';
      return `| ${cell(what)} | ${cell(when)} |`;
    });
  return ['| What we delete | When |', '| --- | --- |', ...rows].join('\n');
}
