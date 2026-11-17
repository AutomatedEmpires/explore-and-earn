// Classic and Compact resume PDFs (SP4 plan Task 13): byte-stable goldens, tagged text, and
// nothing a host must not see on the document itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { extractText, getMeta } from 'unpdf';
import { describe, expect, it } from 'vitest';
import type { ResumeTemplate } from '@/lib/profiles';
import { mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { renderResumePdf } from './render';

const CREATED = new Date('2026-01-01T00:00:00Z');
const SKILLS = [
  'Line handling',
  'Food safety',
  'Knots',
  'Grill station',
  'Customer service',
  'Inventory',
].join(', ');

async function render(template: ResumeTemplate, snapshot = mayaSnapshot()) {
  return renderResumePdf(snapshot, template, { creationDate: CREATED });
}

/** unpdf may detach the buffer it is given, so hand it a copy and keep `bytes` intact. */
async function textOf(bytes: Uint8Array): Promise<string> {
  const extracted = await extractText(bytes.slice(), { mergePages: true });
  return extracted.text;
}

function goldenPath(template: ResumeTemplate): string {
  return path.join(import.meta.dirname, '__golden__', `${template}.pdf`);
}

describe('renderResumePdf', () => {
  it.each(['classic@1', 'compact@1'] as const)(
    '%s is byte-stable and matches its golden',
    async (template) => {
      const first = await render(template);
      const second = await render(template);
      expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
      const file = goldenPath(template);
      if (process.env.UPDATE_GOLDEN === '1') {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, first);
      }
      expect(Buffer.from(first).equals(readFileSync(file))).toBe(true);
    },
  );

  it('puts Maya, her job and the expiry on the classic PDF, and leaves private fields off', async () => {
    const bytes = await render(
      'classic@1',
      mayaSnapshot({
        avatarMediaId: 'photo-marker-9f3c',
        workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] },
      }),
    );
    const text = await textOf(bytes);
    expect(text).toContain('Maya Rodriguez');
    expect(text).toContain('Deckhand');
    expect(text).toContain('Expires Jun 1, 2027');
    expect(text).not.toMatch(/verified/i);
    expect(text).not.toContain('needs_sponsorship');
    expect(text).not.toContain('H-2B');
    expect(text).not.toContain('photo-marker-9f3c');
    const experience = text.indexOf('Experience');
    const education = text.indexOf('Education');
    const skills = text.indexOf('Skills');
    const certifications = text.indexOf('Certifications');
    const languages = text.indexOf('Languages');
    expect(experience).toBeGreaterThan(-1);
    expect(education).toBeGreaterThan(experience);
    expect(skills).toBeGreaterThan(education);
    expect(certifications).toBeGreaterThan(skills);
    expect(languages).toBeGreaterThan(certifications);
    expect(text.split(/\r?\n/).some((row) => row.includes(SKILLS))).toBe(false);

    expect(Buffer.from(bytes).toString('latin1')).toContain('/StructTreeRoot');
    const meta = await getMeta(bytes.slice());
    expect(meta.info.Title).toBe('Maya Rodriguez resume');
  });

  it('puts compact skills on one comma-separated line, highlighted first', async () => {
    const text = await textOf(await render('compact@1'));
    expect(text.split(/\r?\n/).some((row) => row.includes(SKILLS))).toBe(true);
  });

  it('keeps José Núñez intact', async () => {
    const bytes = await render('classic@1', mayaSnapshot({ firstName: 'José', lastName: 'Núñez' }));
    expect(await textOf(bytes)).toContain('José Núñez');
    const meta = await getMeta(bytes.slice());
    expect(meta.info.Title).toBe('José Núñez resume');
  });
});
