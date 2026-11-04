import { describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { HostPageContentSchema, type HostPageContent } from './index';

const page = (edit?: (c: HostPageContent) => void): HostPageContent => {
  const content: HostPageContent = {
    logoMediaId: newId(),
    coverMediaId: null,
    about: {
      story: 'We run a family ski lodge in the Cascades.',
      perks: ['Free ski pass'],
      social: [{ kind: 'instagram', url: 'https://instagram.com/kettleridge' }],
    },
    photos: [{ mediaId: newId(), caption: 'The lodge in winter' }],
    team: [{ name: 'Sam Rivera', title: 'Owner', mediaId: null, bio: null }],
    teamConsent: true,
    faq: [{ q: 'Is housing included?', a: 'Yes, in shared rooms.' }],
  };
  edit?.(content);
  return content;
};

const fails = (c: unknown) => !HostPageContentSchema.safeParse(c).success;

describe('HostPageContentSchema', () => {
  it('parses a host page', () => {
    const content = page();
    expect(HostPageContentSchema.parse(content)).toEqual(content);
  });

  it('caps photos at 24, team at 12 and FAQ at 15', () => {
    const photo = { mediaId: newId(), caption: null };
    const member = { name: 'A', title: 'B', mediaId: null, bio: null };
    const faq = { q: 'Q?', a: 'A.' };
    expect(fails(page((c) => void (c.photos = Array.from({ length: 24 }, () => photo))))).toBe(
      false,
    );
    expect(fails(page((c) => void (c.photos = Array.from({ length: 25 }, () => photo))))).toBe(
      true,
    );
    expect(fails(page((c) => void (c.team = Array.from({ length: 13 }, () => member))))).toBe(true);
    expect(fails(page((c) => void (c.faq = Array.from({ length: 16 }, () => faq))))).toBe(true);
  });

  it('requires https social links', () => {
    expect(
      fails(
        page((c) => void (c.about.social = [{ kind: 'facebook', url: 'http://facebook.com/x' }])),
      ),
    ).toBe(true);
  });

  it('limits captions, story and team text', () => {
    expect(
      fails(page((c) => void (c.photos = [{ mediaId: newId(), caption: 'x'.repeat(141) }]))),
    ).toBe(true);
    expect(fails(page((c) => void (c.about.story = 'x'.repeat(5001))))).toBe(true);
    expect(
      fails(
        page(
          (c) =>
            void (c.team = [{ name: 'x'.repeat(61), title: 'Owner', mediaId: null, bio: null }]),
        ),
      ),
    ).toBe(true);
  });

  it('needs team consent to show a team', () => {
    expect(fails(page((c) => void (c.teamConsent = false)))).toBe(true);
    expect(
      fails(
        page((c) => {
          c.teamConsent = false;
          c.team = [];
        }),
      ),
    ).toBe(false);
  });
});
