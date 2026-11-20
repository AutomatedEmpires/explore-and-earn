
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
const ROOT = "C:\\Users\\Cole0\\AutomatedEmpires\\Projects\\explore-and-earn\\.worktrees\\claude-208-ec62";
const OUT = "C:\\Users\\Cole0\\AutomatedEmpires\\Projects\\explore-and-earn\\.worktrees\\claude-208-ec62\\.data\\e2e\\h2b-render";
const BUILDER_TERMS = {"transportation":"We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.","tools":"Uniforms, cleaning supplies and carts, at no charge.","threeFourthsGuarantee":"We offer at least three-fourths of the job order hours in each 6-week period. If we offer fewer, we pay what you would have earned.","swaContact":"Bozeman Job Service · (406) 555-0142","jobOrderNumber":"MT 4417260"};
const GUEST_TERMS = {"transportation":"We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.","tools":"Uniforms, cleaning supplies and carts, at no charge.","threeFourthsGuarantee":"We offer at least three-fourths of the job order hours in each 12-week period. If we offer fewer, we pay what you would have earned.","swaContact":"Kalispell Job Service · (406) 555-0187","jobOrderNumber":"MT 4419025"};
const PASTED = "Job order MT 4417260, posted Nov 2, xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;
for (const [key, value] of Object.entries(parseEnv(readFileSync(path.join(ROOT, '.env.local.example'), 'utf8')))) {
  if (value && process.env[key] === undefined) process.env[key] = value;
}
const req = createRequire(path.join(ROOT, 'package.json'));
const h = (await import('react')).createElement;
const { renderToStaticMarkup } = await import('react-dom/server');
const { AppRouterContext } = req('next/dist/shared/lib/app-router-context.shared-runtime');
const postcss = createRequire(req.resolve('@tailwindcss/postcss'))('postcss');
const tw = req('@tailwindcss/postcss');
const tailwind = tw.default ?? tw;

const { JobSection } = await import(at('src/app/host/listings/_components/sections-c.tsx'));
const { BuilderStepHeader } = await import(at('src/app/host/listings/_components/BuilderStepHeader.tsx'));
const { GuestPreview } = await import(at('src/app/host/listings/_components/GuestPreview.tsx'));
const { Button } = await import(at('src/ui/components/Button.tsx'));
const model = await import(at('src/app/host/listings/_lib/model.ts'));
const sample = await import(at('src/app/host/listings/_lib/sample.ts'));
const { ListingDetail } = await import(at('src/app/(seeker)/jobs/view/_components/listing-detail.tsx'));
const { buildListingView } = await import(at('src/app/(seeker)/jobs/view/_lib/listing-view.ts'));
const listing = await import(at('src/app/(seeker)/jobs/view/_lib/sample-listing.ts'));

// The builder: the Job step as ListingBuilder lays it out, with a form whose errors show for
// the fields named in touched (as after a blur or a Next).
const ctx = { viewerUserId: sample.SAMPLE_IDS.viewer };
const INTRO = 'Write a few notes and we can draft the description. You can edit every word.';
function draftWith(visa, h2b) {
  const d = sample.sampleDraft();
  const job = { ...d.job, visaSponsorship: visa };
  if (h2b) job.h2b = h2b;
  else delete job.h2b;
  return { ...d, job };
}
function form(draft, touched) {
  const all = Object.assign({}, ...Object.values(model.validateAll(draft, {})));
  const noop = () => {};
  return {
    listingId: sample.SAMPLE_IDS.listing,
    draft: model.normalizedDraft(draft, ctx),
    raw: {},
    ctx,
    phone: true,
    refs: {
      occupations: sample.SAMPLE_OCCUPATIONS,
      destinations: sample.SAMPLE_DESTINATIONS,
      locations: sample.SAMPLE_LOCATIONS,
      team: [],
      orgName: sample.SAMPLE_ORG,
    },
    photos: {},
    set: noop,
    setMany: noop,
    setText: noop,
    touch: noop,
    error: (key) => (touched.includes(key) ? all[key] : undefined),
    allErrors: all,
    addLocation: noop,
    flushAll: async () => true,
  };
}
const section = (title, f, next) =>
  h('section', { id: 'section-job', 'aria-labelledby': 'section-job-title', className: 'flex scroll-mt-6 flex-col gap-4' },
    h('h2', { id: 'section-job-title', className: 'text-24 font-extrabold text-ink' }, title),
    h('p', { className: 'text-16 text-ink-2' }, INTRO),
    h(JobSection, { form: f }),
    next ? h(Button, { size: 'lg', fullWidth: true }, 'Next') : null);
const phone = (f) =>
  h('main', { className: 'flex flex-col gap-4 p-4' },
    h(BuilderStepHeader, { step: 7, total: 10, status: 'Saved 6:14 PM', onBack: () => {}, onExit: () => {} }),
    section('The job', f, true));
const desktop = (f) =>
  h('main', { className: 'flex flex-col gap-6 p-8' },
    h('header', { className: 'flex flex-col gap-3' },
      h('p', { className: 'text-14 text-muted' }, 'Saved 6:14 PM · Housekeeper draft'),
      h('h1', { className: 'text-28 font-extrabold text-ink' }, 'New listing'),
      h('p', { className: 'text-16 text-ink-2' }, 'Move between sections any time. The card updates as you type.')),
    h('div', { className: 'flex flex-col gap-6 xl:flex-row xl:items-start' },
      h('div', { className: 'flex min-w-0 flex-1 flex-col gap-10 xl:max-w-118' }, section('7 · The job', f, false)),
      h('aside', { className: 'hidden xl:sticky xl:top-6 xl:flex xl:w-80 xl:shrink-0' },
        h(GuestPreview, { draft: f.draft, orgName: sample.SAMPLE_ORG, locations: sample.SAMPLE_LOCATIONS, coverPreview: null, headingId: 'guest-card-side' }))));

// The listing detail, signed out, inside the seeker shell's main column.
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
function detail(edit) {
  const view = buildListingView(listing.detailOf(listing.lodgeHousekeeper(edit)), new Map());
  const actions = {
    listingId: listing.LISTING_ID,
    title: view.title,
    source: 'other',
    seeker: false,
    disposition: null,
    applied: false,
    applyHref: '/sign-in',
    signInHref: '/sign-in',
  };
  return h(AppRouterContext.Provider, { value: router },
    h('main', { id: 'main', className: 'mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16' },
      h(ListingDetail, { view, actions, path: '/jobs/view/' + listing.LISTING_ID + '/lodge-housekeeper' })));
}

const over = { ...BUILDER_TERMS, jobOrderNumber: PASTED };
const pages = {
  'builder-not-h2b-phone': phone(form(draftWith('none', BUILDER_TERMS), [])),
  'builder-h2b-phone': phone(form(draftWith('h2b', BUILDER_TERMS), [])),
  'builder-h2b-empty-phone': phone(form(draftWith('h2b', null), [])),
  'builder-h2b-error-phone': phone(form(draftWith('h2b', over), ['job.h2b.jobOrderNumber'])),
  'builder-h2b-desktop': desktop(form(draftWith('h2b', BUILDER_TERMS), [])),
  'builder-h2b-error-desktop': desktop(form(draftWith('h2b', over), ['job.h2b.jobOrderNumber'])),
  'detail-terms': detail((c) => {
    c.job.visaSponsorship = 'h2b';
    c.job.h2b = GUEST_TERMS;
  }),
  'detail-no-terms': detail((c) => {
    c.basics.title = 'Lodge laundry lead';
    c.job.visaSponsorship = 'h2b';
    c.job.h2b = null;
  }),
  'detail-not-h2b': detail((c) => {
    c.job.visaSponsorship = 'none';
    c.job.h2b = GUEST_TERMS;
  }),
};

mkdirSync(OUT, { recursive: true });
const head =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&display=swap">' +
  '<link rel="stylesheet" href="/app.css">';
for (const [name, element] of Object.entries(pages)) {
  const body = renderToStaticMarkup(element);
  writeFileSync(
    path.join(OUT, name + '.html'),
    '<!doctype html><html lang="en"><head>' + head + '<title>' + name + '</title></head><body class="font-sans">' + body + '</body></html>',
  );
}
const from = path.join(ROOT, 'src', 'app', 'globals.css');
const css = await postcss([tailwind({ base: ROOT })]).process(readFileSync(from, 'utf8'), { from });
writeFileSync(path.join(OUT, 'app.css'), css.css);
console.log('H2B_RENDERED ' + JSON.stringify(Object.keys(pages)));
process.exit(0);
