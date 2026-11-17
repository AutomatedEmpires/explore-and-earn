// Issue 116: counsel drafts cite the legal review, and the specs match section 2.8.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../../..');
const BANNER = 'Draft for counsel review, not legal advice';

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

function expectFrontMatter(rel: string, title: string): void {
  const text = read(rel).replace(/\r\n/g, '\n');
  expect(text.startsWith('---\n'), rel).toBe(true);
  expect(text, rel).toContain(`title: ${title}\n`);
  expect(text, rel).toMatch(/^counselQuestions: \|\n(?:  - .+\n)+/m);
  expect(text, rel).toContain(BANNER);
}

const TERMS = [
  ['§11.1 item 1', '30 days'],
  ['§11.1 item 2', 'not the employer'],
  ['§11.1 item 3', '18 or older'],
  ['§11.1 item 4', 'Free for seekers'],
  ['§11.1 item 5', 'you keep ownership'],
  ['§11.1 item 6', 'Community Guidelines'],
  ['§11.1 item 7', 'As described'],
  ['§11.1 item 8', 'NCMEC'],
  ['§11.1 item 9', 'Non-consensual intimate images'],
  ['§11.1 item 10', 'not an offer'],
  ['§11.1 item 11', 'does not decide'],
  ['§11.1 item 12', 'scanned for scams'],
  ['§11.1 item 13', 'nothing in these terms limits'],
  ['§11.1 item 14', 'designated agent'],
  ['§11.1 item 15', 'Privacy Policy'],
  ['§11.1 item 16', 'limit of our liability'],
  ['§11.1 item 17', 'informal resolution'],
  ['§11.1 item 18', 'postal address'],
] as const;

const HOST = [
  ['§11.1 host item 1', 'bind the organization'],
  ['§11.1 host item 2', '30-day publish'],
  ['§11.1 host item 3', 'good-faith range'],
  ['§11.1 host item 4', 'wage and hour'],
  ['§11.1 host item 5', 'no recruitment or visa fees'],
  ['§11.1 host item 6', 'within 72 hours'],
  ['§11.1 host item 7', 'no bulk messaging'],
  ['§11.1 host item 8', 'may not retaliate'],
  ['§11.1 host item 9', 'host publishes'],
  ['§11.1 host item 10', 'paid plan only'],
  ['§11.1 host item 11', 'Suspension'],
  ['§11.1 host item 12', 'Indemnity'],
] as const;

const PRIVACY = [
  ['§11.2 item 1', 'date and version'],
  ['§11.2 item 2', 'work authorization'],
  ['§11.2 item 3', 'precise location'],
  ['§11.2 item 4', 'legal basis'],
  ['§11.2 item 5', 'resume file is never sent'],
  ['§11.2 item 6', 'does not train on your data'],
  ['§11.2 item 7', 'do not sell personal information'],
  ['§11.2 item 8', 'Global Privacy Control'],
  ['§11.2 item 9', 'no penalty'],
  ['§11.2 item 10', '{{retention_table}}'],
  ['§11.2 item 11', 'if there is a breach'],
  ['§11.2 item 12', 'International transfers'],
  ['§11.2 item 13', 'under 18'],
  ['§11.2 item 14', 'Changes to this policy'],
] as const;

const COUNSEL = [
  'Is Explore&Earn a "third party" under 820 ILCS 112/10(b-25)',
  'farm labor contractor under 29 U.S.C. § 1802(7)',
  'Is a 24-hour filing commitment sound under 18 U.S.C. § 2258A(a)',
  'Is the label and disclaimer in section 9 adequate',
  'what are the lodging and meal credit limits',
  'is pool access a "sale" under the CCPA',
  'Is the two-question display the right line under 8 U.S.C. § 1324b',
  'which state breach-notification laws apply',
  'What do Colorado SB 26-189, Illinois HB 3773',
  'Is Explore&Earn a covered platform at launch',
  'whether to accept EU and UK seekers at launch',
  'Arbitration and class waiver: yes or no',
  'Are these answers "consumer reviews" under 16 CFR part 465',
] as const;

describe('issue 116 counsel drafts', () => {
  it('gives Terms, Host Terms and Privacy the Task 25 front matter', () => {
    expectFrontMatter('src/modules/content/drafts/terms.md', 'Terms of Service');
    expectFrontMatter('src/modules/content/drafts/host-terms.md', 'Host Terms');
    expectFrontMatter('src/modules/content/drafts/privacy.md', 'Privacy Policy');
    expectFrontMatter('src/modules/content/drafts/staying-safe.md', 'Staying safe');
  });

  it('covers every section 11 outline item and cites that section', () => {
    const terms = read('src/modules/content/drafts/terms.md');
    const host = read('src/modules/content/drafts/host-terms.md');
    const privacy = read('src/modules/content/drafts/privacy.md');
    for (const [cite, phrase] of [...TERMS]) {
      expect(terms, cite).toContain(cite);
      expect(terms, phrase).toContain(phrase);
    }
    for (const [cite, phrase] of [...HOST]) {
      expect(host, cite).toContain(cite);
      expect(host, phrase).toContain(phrase);
    }
    for (const [cite, phrase] of [...PRIVACY]) {
      expect(privacy, cite).toContain(cite);
      expect(privacy, phrase).toContain(phrase);
    }
    expect(terms).toContain('Block');
    expect(terms).toContain('Report');
    expect(host).toContain('$99');
    expect(host).toContain('$299');
    expect(host).toContain('$599');
    expect(host).toContain('$39');
    expect(host).toContain('$29');
    expect(host).toContain('$19');
    expect(host).toContain('first 100');
    expect(host).toContain('90 days');
    expect(host).toContain('30% off');
    expect(host).toContain('6 months');
    expect(host).toContain('Active Explore&Earn host since');
    expect(privacy).toContain('does not train on your data');
  });

  it('puts every section 13 question in the counsel packet', () => {
    const packet = read('docs/legal/counsel-packet.md');
    expect(packet).toContain(BANNER);
    for (const question of COUNSEL) expect(packet, question).toContain(question);
    expect(packet).toContain('§13 question 1');
    expect(packet).toContain('§13 question 13');
    expect(packet).toContain('work-location eligibility');
    expect(packet).toContain('non-refundable once started');
    expect(packet).toContain('7-year billing retention');
    expect(packet).toContain('redaction of shared applications');
    expect(packet).toContain('fit scores in access responses');
    expect(packet).toContain('bias audit');
  });

  it('drafts the staying-safe page from section 7', () => {
    const page = read('src/modules/content/drafts/staying-safe.md');
    expect(page).toContain('§7');
    expect(page).toContain('never pay to get a job');
    expect(page).toContain('will not ask for bank details before hiring');
    expect(page).toContain("check the employer's own website");
    expect(page).toContain('tell someone where you are going');
    expect(page).toContain('verified');
    expect(page).toContain('trusted');
    expect(page).toContain('safe');
  });

  it('keeps the breach runbook to one page of section 4.7', () => {
    const runbook = read('docs/runbooks/breach-response.md');
    expect(runbook).toContain(BANNER);
    expect(runbook).toContain('§4.7');
    expect(runbook).toContain('Who decides');
    expect(runbook).toContain('How affected users are identified');
    expect(runbook).toContain('Notice template');
    expect(runbook).toContain('Regulator list');
    expect(runbook).toContain('false pretenses');
    expect(runbook.split(/\r?\n/).length).toBeLessThanOrEqual(80);
  });

  it('lists the DMCA designated-agent fields the founder files', () => {
    const dmca = read('docs/legal/dmca-designated-agent.md');
    expect(dmca).toContain(BANNER);
    expect(dmca).toContain('§11.1 item 14');
    expect(dmca).toContain('https://www.copyright.gov/dmca-directory/');
    expect(dmca).toContain('full legal name');
    expect(dmca).toContain('alternate names');
    expect(dmca).toContain('physical street address');
    expect(dmca).toContain('[founder supplies]');
  });
});

describe('issue 116 spec updates', () => {
  it('records the Colorado check in section 14 and renames the fit-score gate', () => {
    const review = read('docs/legal/2026-11-legal-review.md');
    expect(review).toContain('https://leg.colorado.gov/bills/sb26-189');
    expect(review).toContain('repeals and reenacts');
    expect(review).toContain('Signed Act dated 2026-05-14');
    expect(review).toContain('chapter 131');
    expect(review).toContain('2027-01-01');
    expect(review).not.toContain('Not confirmed at leg.colorado.gov');
    expect(review).not.toContain('This was not confirmed at the Colorado General Assembly');

    const spec = read('docs/superpowers/specs/2026-11-03-sp8-trust-privacy-launch-design.md');
    expect(spec).toContain('| `legal.fit_score` | automated hiring tools compliance |');
    expect(spec).not.toContain('NYC and Colorado compliance');
    expect(spec).toContain('Illinois HB 3773');
    expect(spec).toContain("California's automated-decision regulations");
    expect(spec).toContain('NYC Local Law 144');
    expect(spec).toContain('SB 26-189');

    const plan = read('docs/superpowers/plans/2026-11-03-sp8-trust-privacy-launch.md');
    expect(plan).toContain('automated hiring tools compliance');
    expect(plan).toContain('replacing SB 24-205');
  });

  it('updates SP5 open item 2, protected-trait filters and honest labels', () => {
    const spec = read('docs/superpowers/specs/2026-11-03-sp5-host-hiring-design.md');
    expect(spec).toContain(
      'Hosts may not filter or sort the candidate pool or applicants by age, date of birth, sex, photo, name, national origin or visa type (legal review §2.2 item 3; P0 item 13).',
    );
    expect(spec).toContain('Colorado SB 26-189');
    expect(spec).toContain('Illinois HB 3773');
    expect(spec).toContain("California's automated-decision regulations");
    expect(spec).toContain('NYC Local Law 144');
    expect(spec).toContain('hiring.fit_disabled_states');
    expect(spec).toContain('Only a seeker with a real application and an accepted offer');
    expect(spec).toContain('One answer per person per job');
    expect(spec).toContain('shares an email domain, device or payment detail');
    expect(spec).toContain('Show all answers once there are five');
    expect(spec).toContain('never let a host hide or remove one');
    expect(spec).toContain('fraud, abuse, wrong employer');
    expect(spec).toContain('Hosts may reply but not edit');
    expect(spec).toContain('Hosts may not offer anything for an answer');
    expect(spec).toContain('Compute from logged events only');
    expect(spec).toContain('show the date basis in a tooltip');
    expect(spec).toContain('hide the label when there is too little data');
    expect(spec).toContain('Never set by an operator by hand');
    expect(spec).toContain('Count unique signed-in people or de-duplicated guests');
    expect(spec).toContain('exclude bots');

    const plan = read('docs/superpowers/plans/2026-11-03-sp5-host-hiring.md');
    expect(plan).toContain('P0 item 13');
    expect(plan).toContain('P0 item 19');
    expect(plan).toContain('national origin or visa type');
  });
});
