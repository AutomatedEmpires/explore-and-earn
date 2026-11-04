// Every gallery route, in the order the navigation and the index list them.
// tests/e2e/design-system.spec.ts checks each one renders, passes axe and matches its screenshots.

export const sections = [
  {
    slug: 'foundations',
    title: 'Foundations',
    nav: 'Foundations',
    summary: 'Color roles, category colors, type scale, radius, shadows and spacing.',
  },
  {
    slug: 'buttons',
    title: 'Buttons',
    nav: 'Buttons',
    summary: 'Button and IconButton in every variant, size and state.',
  },
  {
    slug: 'chips',
    title: 'Chips and badges',
    nav: 'Chips',
    summary: 'The two-line Chip, filter Pills, Badges and category badges.',
  },
  {
    slug: 'identity',
    title: 'Avatars and logos',
    nav: 'Identity',
    summary: 'People are round avatars; organizations are rounded-square logos.',
  },
  {
    slug: 'cards',
    title: 'Cards',
    nav: 'Cards',
    summary: 'One card template, filled as a job card or a candidate card.',
  },
  {
    slug: 'forms',
    title: 'Forms',
    nav: 'Forms',
    summary: 'Inputs, selects, checkboxes, radios, switches, sliders and tabs.',
  },
  {
    slug: 'navigation',
    title: 'Navigation',
    nav: 'Navigation',
    summary: 'TopBar, BottomNav, Sidebar and the organization switcher.',
  },
  {
    slug: 'overlays',
    title: 'Overlays',
    nav: 'Overlays',
    summary: 'The chip pop-up Sheet, Dialog and Tooltip.',
  },
  {
    slug: 'feedback',
    title: 'Feedback and states',
    nav: 'Feedback',
    summary: 'Toasts, empty and error states, placeholders and loading skeletons.',
  },
  {
    slug: 'charts',
    title: 'Charts',
    nav: 'Charts',
    summary: 'StatTile and bar, stacked bar and donut charts, each with a table view.',
  },
] as const;

export type Section = (typeof sections)[number];
export type SectionSlug = Section['slug'];

export function findSection(slug: string): Section | undefined {
  return sections.find((s) => s.slug === slug);
}

export const referenceScreens = [
  {
    slug: 'seek',
    title: 'Seek',
    summary: 'The seeker’s Seek tab: search, category filters and job cards.',
    role: 'Seeker',
  },
  {
    slug: 'candidate',
    title: 'Candidate card',
    summary: 'Host Applicants: the same card template, filled with a candidate.',
    role: 'Host',
  },
  {
    slug: 'housing',
    title: 'Housing pop-up',
    summary: 'The Housing chip’s sheet, open over Seek.',
    role: 'Seeker',
  },
  {
    slug: 'host-header',
    title: 'Host page header',
    summary: 'The public host page: cover, logo, badges, stats and tabs.',
    role: 'Public',
  },
  {
    slug: 'profile-header',
    title: 'Profile header',
    summary: 'The seeker’s Profile tab: header, availability, my jobs, visibility.',
    role: 'Seeker',
  },
  {
    slug: 'community-post',
    title: 'Community post',
    summary: 'A photo post with reactions, and a host announcement.',
    role: 'Seeker',
  },
] as const;

export const galleryHome = '/design-system';
export const topbarOptionsPath = '/design-system/topbar-options';

export const sectionPath = (slug: SectionSlug) => `/design-system/${slug}`;
export const referencePath = (slug: (typeof referenceScreens)[number]['slug']) =>
  `/design-system/reference/${slug}`;
