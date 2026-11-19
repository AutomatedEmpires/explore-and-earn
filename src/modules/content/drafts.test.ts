// The eight legal drafts for counsel and the seeder (SP8 plan Task 25, spec 8.5). The drafts are
// agent drafts, never legal advice: seeding saves each as version 1 in `draft`, and nothing here
// sends a draft to counsel, approves it or publishes it. On PGlite.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { loadPrivacyRegistry } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { ensureLegalDrafts, parseDraft, readLegalDraft } from './drafts';
import { getPublishedLegal, LEGAL_SLUGS, LEGAL_TITLES, type LegalSlug } from './legal';

const DRAFTS = path.resolve('src/modules/content/drafts');
const BANNER = 'Draft for counsel review, not legal advice';

function raw(slug: LegalSlug): string {
  return readFileSync(path.join(DRAFTS, `${slug}.md`), 'utf8');
}

const body = (slug: LegalSlug) => parseDraft(raw(slug)).bodyMd;

/** Spec 8.5 lists questions for counsel for these drafts. */
const WITH_SPEC_QUESTIONS: readonly LegalSlug[] = [
  'terms',
  'host-terms',
  'privacy',
  'fit-score',
  'international',
  'subprocessors',
];

describe('parseDraft', () => {
  it('splits the front matter from the body', () => {
    expect(
      parseDraft(
        '---\r\ntitle: Host Terms\r\ncounselQuestions: |\r\n  - One?\r\n  - Two?\r\n---\r\n\r\nThe body.\r\n',
      ),
    ).toEqual({ title: 'Host Terms', counselQuestions: '- One?\n- Two?', bodyMd: 'The body.' });
  });

  it('refuses a draft without front matter, a title or a body', () => {
    expect(() => parseDraft('The body.')).toThrow(/front matter/);
    expect(() => parseDraft('---\ncounselQuestions: |\n  - One?\n---\n\nBody.')).toThrow(/title/);
    expect(() => parseDraft('---\ntitle: Host Terms\n---\n\n')).toThrow(/body/);
  });
});

describe('the eight drafts', () => {
  it('each parse with its title, carry the draft banner, and the spec questions where it has them', async () => {
    for (const slug of LEGAL_SLUGS) {
      const draft = await readLegalDraft(slug, DRAFTS);
      expect(draft.title, slug).toBe(LEGAL_TITLES[slug]);
      expect(draft.bodyMd, slug).toContain(BANNER);
      if (WITH_SPEC_QUESTIONS.includes(slug)) expect(draft.counselQuestions, slug).not.toBe('');
    }
  });

  it('Terms: 18 or older, Block and Report, not the employer', () => {
    const terms = body('terms');
    for (const phrase of ['18', 'Block', 'Report', 'not the employer'])
      expect(terms).toContain(phrase);
  });

  it('Host Terms: prices, slots, the founding offer texts for counsel and the badge wording', () => {
    const host = body('host-terms');
    for (const phrase of [
      '$99',
      '$299',
      '$599',
      '$39',
      '$29',
      '$19',
      'first 100',
      '90 days',
      '30% off',
      '6 months',
      'Active Explore&Earn host since',
    ]) {
      expect(host, phrase).toContain(phrase);
    }
    // FD-7 (2026-11-04) withdrew the 90-day offer; the draft puts the replacement beside it for
    // counsel and chooses neither.
    expect(host).toContain('50% off');
    expect(host).toContain('first annual term');
    expect(host).toContain('This draft does not choose between them.');
  });

  it('Privacy Policy: the retention table token and the AI provider training statement', () => {
    const privacy = body('privacy');
    expect(privacy).toContain('{{retention_table}}');
    expect(privacy).toContain('does not train on your data');
  });

  it('Fit score notice: the inputs, what it never uses, and that it never rejects', () => {
    const fit = body('fit-score');
    expect(fit).toContain('It never uses protected traits, photo, name, age or gender.');
    expect(fit).toContain('never automatically rejects');
    expect(fit).toContain('It ranks pools and sorts applicants only.');
    for (const input of ['availability', 'skills', 'certifications', 'minimum pay', 'relocate']) {
      expect(fit, input).toContain(input);
    }
    expect(fit).toContain('work-location eligibility');
    const questions = parseDraft(raw('fit-score')).counselQuestions;
    for (const law of [
      'Colorado SB 26-189',
      'Illinois HB 3773',
      "California's automated-decision regulations",
      'NYC Local Law 144',
    ]) {
      expect(questions, law).toContain(law);
    }
  });

  it('Working in the US from abroad: no visa advice, and only official .gov links', () => {
    const page = raw('international');
    expect(page).toContain("We don't give visa advice");
    for (const program of ['J-1', 'H-2A', 'H-2B']) expect(page).toContain(program);
    const links = [...page.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(new URL(link).hostname, link).toMatch(/\.gov$/);
  });

  it('Subprocessors: all 13 vendors, each with purpose, data, region and DPA status', () => {
    const page = body('subprocessors');
    expect(page).toContain('| Vendor | Purpose | Data | Region | DPA status |');
    const vendors = [
      'Clerk',
      'Supabase',
      'Vercel',
      'Stripe',
      'Resend',
      'PostHog',
      'Sentry',
      'Mapbox',
      'Anthropic',
      'Cloudmersive',
      'Microsoft PhotoDNA',
      'Doppler',
      'GitHub',
    ];
    const rows = page
      .split('\n')
      .filter((line) => /^\| [A-Z]/.test(line) && !line.startsWith('| Vendor'));
    expect(rows.map((row) => row.split('|')[1]?.trim())).toEqual(vendors);
    for (const row of rows) expect(row.split('|').length, row).toBe(7);
    // No DPA is shown as accepted before the founder accepts it.
    expect(page).not.toMatch(/\| Accepted/i);
  });

  it('Cookie Policy: the banner sentence verbatim and the rest of spec 8.4', () => {
    const cookies = body('cookies');
    expect(cookies).toContain(
      'We use cookies to keep you signed in. With your OK, we also use analytics cookies to see how Explore&Earn is used so we can improve it. We never sell your data.',
    );
    for (const phrase of [
      '"Accept analytics"',
      '"Reject"',
      '"Cookie settings"',
      'Iceland, Liechtenstein, Norway, the United Kingdom and Switzerland',
      'x-vercel-ip-country',
      'Sec-GPC: 1',
      '`1.<consent id>.<a or r>.<time>`',
      '31,536,000',
      'There are no advertising cookies.',
      'Sentry) sets no cookies',
      // Consent is per device.
      'device and browser',
    ]) {
      expect(cookies, phrase).toContain(phrase);
    }
  });

  it('Community Guidelines: photos only, no captions or comments, child-safety scanning and NCMEC', () => {
    const community = body('community');
    expect(community).toContain('Photos only');
    expect(community).toContain('no captions');
    expect(community).toContain('no comments');
    expect(community).toContain('PhotoDNA');
    expect(community).toContain('NCMEC');
  });
});

describe('ensureLegalDrafts', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it('seeds version 1 of each document once, as an unpublished draft with its questions', async () => {
    expect(await ensureLegalDrafts(t.db, { dir: DRAFTS })).toEqual({ created: [...LEGAL_SLUGS] });
    expect(await ensureLegalDrafts(t.db, { dir: DRAFTS })).toEqual({ created: [] });

    const rows = await queryRows<{
      slug: string;
      version: number;
      status: string;
      material: boolean;
      created_by: string | null;
      has_questions: boolean;
    }>(
      t.db,
      sql`select slug, version, status, material, created_by,
                 counsel_questions <> '' as has_questions
          from app.legal_documents order by slug`,
    );
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row, row.slug).toMatchObject({
        version: 1,
        status: 'draft',
        material: true,
        created_by: null,
      });
      expect(row.has_questions, row.slug).toBe(true);
    }
    for (const slug of LEGAL_SLUGS) expect(await getPublishedLegal(t.db, slug), slug).toBeNull();
  });

  it('writes the registered retention rules into the privacy policy in place of the token', async () => {
    const [privacy] = await queryRows<{ body_md: string }>(
      t.db,
      sql`select body_md from app.legal_documents where slug = 'privacy'`,
    );
    const policy = privacy?.body_md ?? '';
    expect(policy).not.toContain('{{retention_table}}');
    expect(policy).toContain('| What we delete | When |');
    const { rules } = await loadPrivacyRegistry();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const [what, when] = rule.description.split(/ (?:are|is) deleted /);
      expect(policy, rule.key).toContain(`| ${what ?? rule.description} |`);
      if (when) expect(policy, rule.key).toContain(` ${when} |`);
    }
  });
});
