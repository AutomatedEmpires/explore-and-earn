import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/ui/components';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  GalleryHorizontal,
  Menu,
  Target,
  Users,
  type IconComponent,
} from '@/ui/icons';
import { GalleryShell } from './_gallery/GalleryShell';
import {
  galleryHome,
  referencePath,
  referenceScreens,
  sectionPath,
  sections,
  topbarOptionsPath,
} from './_gallery/routes';
import { PageIntro } from './_gallery/Specimen';

const principles: { icon: IconComponent; title: string; text: string }[] = [
  {
    icon: Target,
    title: 'Color carries meaning, nothing else',
    text: 'Maritime blue, Seasonal amber, Farm green, Remote red, and the green “Provided”. Everything else is warm neutrals with near-black primary buttons.',
  },
  {
    icon: Users,
    title: 'Organizations are squares, people are circles',
    text: 'Rounded-square logos for hosts, round avatars for people, everywhere.',
  },
  {
    icon: GalleryHorizontal,
    title: 'One card, two uses',
    text: 'The job card and the candidate card fill the same template, with three two-line chips.',
  },
  {
    icon: Check,
    title: 'Never color alone',
    text: 'Categories, statuses and errors always pair their color with an icon and text.',
  },
  {
    icon: BadgeCheck,
    title: '44 px targets, visible focus',
    text: 'Every control is at least 44 px to touch and shows a focus ring from the keyboard.',
  },
  {
    icon: CircleAlert,
    title: 'Light and dark, AA contrast',
    text: 'Both themes follow the device; every text pair reaches 4.5:1 and every control 3:1.',
  },
];

function LinkCard({
  href,
  title,
  children,
  eyebrow,
}: {
  href: string;
  title: string;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 no-underline hover:bg-surface-2 motion-safe:transition-colors"
    >
      {eyebrow ? (
        <span className="text-12 font-bold tracking-wider text-muted uppercase">{eyebrow}</span>
      ) : null}
      <span className="flex items-center justify-between gap-3 text-17 font-bold text-ink">
        {title}
        <ArrowRight className="size-4.5 shrink-0 text-muted group-hover:text-ink" />
      </span>
      <span className="text-14 text-ink-2">{children}</span>
    </Link>
  );
}

function Group({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 pt-14">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-24 font-extrabold text-ink">
          {title}
        </h2>
        <p className="max-w-3xl text-15 text-ink-2">{lede}</p>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemIndex() {
  return (
    <GalleryShell current={galleryHome}>
      <PageIntro
        title="Design system"
        aside={
          <Badge tone="warning" icon={CircleAlert}>
            Awaiting founder review
          </Badge>
        }
      >
        <p>
          Direction B: clean and photo-first, with warm neutrals. Professional, clean, easy to read
          and meticulously organized. Every component appears here in every state, in light and dark
          side by side. Screens are built from these parts only.
        </p>
      </PageIntro>

      <Group
        id="principles"
        title="Principles"
        lede="The rules every screen follows. Lint enforces the color rule: outside the design system there are no raw colors."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4 rounded-xl bg-surface p-5 shadow-card">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink">
                <Icon className="size-5" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-15 font-bold text-ink">{title}</span>
                <span className="text-14 text-ink-2">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group
        id="components"
        title="Components"
        lede="Each page shows one family: every variant, every state (default, hover, focus, disabled, loading, error), light beside dark."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <li key={s.slug}>
              <LinkCard href={sectionPath(s.slug)} title={s.title}>
                {s.summary}
              </LinkCard>
            </li>
          ))}
        </ul>
      </Group>

      <Group
        id="reference"
        title="Reference screens"
        lede="The design board’s Direction B artboards, rebuilt from the components with the same sample content: Kettle Ridge Lodge and Maya Rodriguez. Each one is responsive, from phone to desktop."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {referenceScreens.map((r) => (
            <li key={r.slug}>
              <LinkCard href={referencePath(r.slug)} title={r.title} eyebrow={r.role}>
                {r.summary}
              </LinkCard>
            </li>
          ))}
        </ul>
      </Group>

      <Group
        id="decisions"
        title="Open decision"
        lede="The product spec leaves the top bar open (section 15.1). The options are compared side by side; the shells follow the one chosen."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LinkCard href={topbarOptionsPath} title="Top bar options" eyebrow="Decide">
            <span className="flex items-start gap-2">
              <Menu className="mt-0.5 size-4 shrink-0 text-muted" />
              Icons only, icons with a role badge, or a hamburger menu with a role badge.
            </span>
          </LinkCard>
        </div>
      </Group>
    </GalleryShell>
  );
}
