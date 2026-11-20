// The listing detail (issue #109), from Figma page 02 Seeker:
// - 390 (45:7496, 176:13308): a full-bleed cover, the whole deal in the first viewport, and
//   Skip · Apply · Save pinned above the bottom tabs;
// - 768 (45:7566): one centred column with the action row under the deal;
// - 1440 (45:7615): a 600 px side panel with its own header and a pinned action bar.
// An H-2B listing adds "H-2B job terms" after Perks (issue 208; "H-2B fields" 223:20362).
// A signed-in seeker reports the job, blocks the host or mutes it at the end (issue 224,
// listing-safety.tsx); a guest keeps the Report link.
// Every fact renders on the server, so nothing moves once the page has painted.
import { Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Button, CategoryBadge, IconLink, Img, OrgLogo } from '@/ui/components';
import { cn } from '@/ui/cn';
import {
  BadgeCheck,
  Banknote,
  BedDouble,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  Flag,
  ShieldCheck,
  Users,
  Utensils,
  X,
  type IconComponent,
} from '@/ui/icons';
import type { H2bTerm, H2bTerms, ListingView, PhotoRef } from '../_lib/listing-view';
import {
  ActionBar,
  ListingActionsProvider,
  ShareButton,
  type ListingActionsInit,
} from './listing-actions';
import { ListingSafety, type ListingSafetyHost } from './listing-safety';

/**
 * At 390 the bar is fixed on top of the bottom tabs (their border, padding and 56 px row). It is
 * not sticky: a sticky bar comes to rest at its own place once the listing's end scrolls into
 * view, which is the shell's bottom padding above the tabs, not on them.
 */
const ABOVE_BOTTOM_TABS = {
  bottom: 'calc(1px + 3.875rem + max(1rem, env(safe-area-inset-bottom)))',
} as const;

function Cover({ cover, photoCount }: { cover: PhotoRef; photoCount: number }) {
  return (
    <div className="relative h-50 overflow-hidden bg-surface-2 md:h-75 md:rounded-xl xl:h-65 xl:rounded-none">
      <Img
        src={cover.src}
        srcSet={cover.srcSet}
        sizes="(min-width: 1280px) 600px, (min-width: 768px) 704px, 100vw"
        alt={cover.alt}
        loading="eager"
        fetchPriority="high"
        className="size-full object-cover"
      />
      {photoCount > 1 ? (
        <Badge tone="surface" icon={ImageIcon} className="absolute right-3 bottom-3">
          {photoCount} photos
        </Badge>
      ) : null}
    </div>
  );
}

function HostRow({ host }: { host: ListingView['host'] }) {
  return (
    <Link
      href={host.href}
      className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 hover:bg-surface-2 motion-safe:transition-colors"
    >
      <OrgLogo name={host.name} src={host.logoSrc} size="md" decorative />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-16 font-semibold text-ink">
          <span className="truncate">{host.name}</span>
          {host.since ? (
            <>
              <BadgeCheck className="size-4 shrink-0" />
              <span className="sr-only">, {host.since}</span>
            </>
          ) : null}
        </span>
        <span className="text-14 text-muted">{host.location}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
  strong = true,
}: {
  icon: IconComponent;
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <li className={cn('flex items-center gap-2.5 text-16 text-ink', strong && 'font-semibold')}>
      <Icon className="size-5 shrink-0" />
      <span>
        <span className="sr-only">{label}: </span>
        {children}
      </span>
    </li>
  );
}

function Deal({ deal }: { deal: ListingView['deal'] }) {
  return (
    <ul aria-label="The deal" className="flex flex-col gap-2.5">
      <Fact icon={Banknote} label="Pay">
        {deal.pay}
      </Fact>
      <Fact icon={CalendarDays} label="Dates">
        {deal.dates}
      </Fact>
      <Fact icon={BedDouble} label="Housing">
        {deal.housing}
      </Fact>
      <Fact icon={Utensils} label="Meals">
        {deal.meals}
      </Fact>
      {deal.couples ? (
        <Fact icon={Users} label="Couples">
          {deal.couples}
        </Fact>
      ) : null}
      <Fact icon={Clock} label="Freshness" strong={false}>
        {deal.freshness}
      </Fact>
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 text-16 text-ink">
      <h2 className="text-21 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function PhotoStrip({ photos, label }: { photos: PhotoRef[]; label: string }) {
  if (photos.length === 0) return null;
  return (
    <ul aria-label={label} className="grid grid-cols-4 gap-2">
      {photos.map((p) => (
        <li key={p.src}>
          <Img
            src={p.src}
            srcSet={p.srcSet}
            sizes="(min-width: 1280px) 136px, (min-width: 768px) 170px, 25vw"
            alt={p.alt}
            className="aspect-4/3 w-full rounded-md bg-surface-2 object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

const H2B_ICON: Record<H2bTerm['kind'], IconComponent> = {
  travel: Compass,
  tools: Briefcase,
  guarantee: Clock,
  state: FileText,
};

/**
 * "H-2B job terms" (issue 208; Figma 223:20363, none filled in 223:20530): each row has an icon
 * and a text label, so nothing rests on the icon alone.
 */
function H2bSection({ h2b }: { h2b: H2bTerms }) {
  return (
    <Section title="H-2B job terms">
      <p>{h2b.intro}</p>
      {h2b.terms.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {h2b.terms.map((t) => {
            const Icon = H2B_ICON[t.kind];
            return (
              <li key={t.kind} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="font-semibold">{t.label}</p>
                  <p className="whitespace-pre-line wrap-anywhere">{t.value}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {h2b.closing ? <p className="text-ink-2">{h2b.closing}</p> : null}
    </Section>
  );
}

export type ListingDetailProps = {
  view: ListingView;
  actions: ListingActionsInit;
  /** The listing's own path, for Share. */
  path: string;
  /**
   * The host, for a signed-in seeker: Report opens the ReportSheet, and Block host and the mute
   * switch show (issue 224). Null or left out for a guest, who keeps the link to /report.
   */
  safety?: ListingSafetyHost | null;
};

export function ListingDetail({ view, actions, path, safety = null }: ListingDetailProps) {
  return (
    <ListingActionsProvider init={actions}>
      {/* 1440: the panel sits over a scrim; a click outside goes back to Seek. */}
      <Link
        href="/"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden xl:fixed xl:inset-0 xl:z-40 xl:block xl:bg-scrim"
      />
      <article
        aria-labelledby="listing-title"
        className="-mx-4 -mt-6 md:mx-auto md:-mt-4 md:max-w-180 xl:fixed xl:inset-y-0 xl:right-0 xl:z-50 xl:m-0 xl:flex xl:w-150 xl:max-w-none xl:flex-col xl:bg-bg xl:shadow-overlay"
      >
        <div className="hidden h-17 shrink-0 items-center gap-2 border-b border-line px-3 xl:flex">
          <IconLink href="/" label="Close" icon={X} />
          <p className="truncate text-16 font-semibold text-ink">{view.title}</p>
        </div>
        <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {view.cover ? <Cover cover={view.cover} photoCount={view.photoCount} /> : null}
          {/* pb-16 at 390: with the shell's own padding, the last row ends 24 px above the bar. */}
          <div className="flex flex-col gap-4 px-4 pt-4 pb-16 md:px-0 md:pb-6 xl:px-4">
            <div className="flex flex-col items-start gap-1.5">
              <CategoryBadge category={view.category} />
              <h1 id="listing-title" className="text-28 font-extrabold text-ink">
                {view.title}
              </h1>
            </div>
            <HostRow host={view.host} />
            <Deal deal={view.deal} />
            <ActionBar className="hidden md:flex xl:hidden" />

            <Section title="Pay">
              <p className="text-19 font-bold">{view.pay.headline}</p>
              <p>{view.pay.notes}</p>
              <p>{view.pay.otherDeductions}</p>
            </Section>

            {view.housing ? (
              <Section title="Housing">
                <PhotoStrip photos={view.housing.photos} label="Housing photos" />
                <p className="font-semibold">{view.housing.line}</p>
                {view.housing.finePrint ? <p>{view.housing.finePrint}</p> : null}
              </Section>
            ) : null}

            {view.meals ? (
              <Section title="Meals">
                <PhotoStrip photos={view.meals.photos} label="Meal photos" />
                <p className="font-semibold">{view.meals.line}</p>
                {view.meals.note ? <p>{view.meals.note}</p> : null}
              </Section>
            ) : null}

            <Section title="Dates and hours">
              <p>{view.datesAndHours}</p>
            </Section>

            <Section title="About the job">
              <p className="whitespace-pre-line">{view.about.description}</p>
              {view.about.responsibilities.length > 0 ? (
                <ul className="list-disc pl-5">
                  {view.about.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </Section>

            {view.typicalDay ? (
              <Section title="A typical day">
                <p className="whitespace-pre-line">{view.typicalDay}</p>
              </Section>
            ) : null}

            {view.qualifications ? (
              <Section title="Qualifications">
                <p>{view.qualifications}</p>
              </Section>
            ) : null}

            {view.perks ? (
              <Section title="Perks">
                <p>{view.perks}</p>
              </Section>
            ) : null}

            {/* After Perks, so the approved order is unchanged (#45 lead decision). */}
            {view.h2b ? <H2bSection h2b={view.h2b} /> : null}

            {view.details.length > 0 ? (
              <Section title="Details">
                <dl className="flex flex-col gap-1">
                  {view.details.map((d) => (
                    <div key={d.label}>
                      <dt className="inline font-semibold">{d.label}: </dt>
                      <dd className="inline">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            ) : null}

            <p className="flex items-start gap-2.5 text-16 text-ink">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
              You never pay to get a job. Report any listing that asks you to.
            </p>

            {safety ? (
              <ListingSafety
                listingId={view.listingId}
                host={safety}
                share={<ShareButton url={path} />}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost">
                  <Link href={`/report?subject=listing:${encodeURIComponent(view.listingId)}`}>
                    <Flag className="size-5" />
                    Report
                  </Link>
                </Button>
                <ShareButton url={path} />
              </div>
            )}
          </div>
        </div>
        <ActionBar
          className="fixed inset-x-0 z-30 border-t border-line bg-surface px-4 py-3 md:hidden xl:static xl:flex"
          style={ABOVE_BOTTOM_TABS}
        />
      </article>
    </ListingActionsProvider>
  );
}
