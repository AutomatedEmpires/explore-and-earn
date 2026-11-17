import type { TemplateVars } from './types';

const FILL_INS = ['first_name', 'position', 'org_name', 'my_first_name'] as const;

/** Replaces the four fill-ins. Anything else in braces stays as typed. */
export function fillTemplate(body: string, v: TemplateVars): string {
  return body.replaceAll(/\{(first_name|position|org_name|my_first_name)\}/g, (match, key: string) => {
    if ((FILL_INS as readonly string[]).includes(key)) return v[key as keyof TemplateVars];
    return match;
  });
}
