// Host page content (SP2 spec section 4): the About story, perks and social links, photos, team
// and FAQ. Saving it runs `text_safety` (W7); images go through the Foundation media scan.
import { z } from 'zod';

/** Control characters other than \n and \t. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !CONTROL_CHARS.test(s), { message: 'Remove control characters' });

const httpsUrl = z.url({ protocol: /^https$/ }).max(2_000);

export const SOCIAL_KINDS = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
] as const;

export const HostPageContentSchema = z
  .object({
    logoMediaId: z.uuid().nullable(),
    coverMediaId: z.uuid().nullable(),
    about: z.object({
      story: text(0, 5_000),
      perks: z.array(text(1, 200)).max(20),
      social: z.array(z.object({ kind: z.enum(SOCIAL_KINDS), url: httpsUrl })).max(6),
    }),
    photos: z.array(z.object({ mediaId: z.uuid(), caption: text(1, 140).nullable() })).max(24),
    team: z
      .array(
        z.object({
          name: text(1, 60),
          title: text(1, 60),
          mediaId: z.uuid().nullable(),
          bio: text(1, 300).nullable(),
        }),
      )
      .max(12),
    /** The host confirms the people shown agreed to appear. */
    teamConsent: z.boolean(),
    faq: z.array(z.object({ q: text(1, 200), a: text(1, 1_000) })).max(15),
  })
  .superRefine((c, ctx) => {
    if (c.team.length > 0 && !c.teamConsent) {
      ctx.addIssue({
        code: 'custom',
        path: ['teamConsent'],
        message: 'Confirm your team agreed to appear on your page',
      });
    }
  });

export type HostPageContent = z.output<typeof HostPageContentSchema>;
