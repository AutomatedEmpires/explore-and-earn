'use client';

// The design board's public host page artboard (product spec section 8): cover and logo, name
// with the subscriber badge, Hiring now, categories, location, reply time, Follow and Website,
// the stats and the tabs, with the Jobs tab grouped by location.
import {
  Badge,
  Button,
  CategoryBadge,
  EmptyState,
  IconButton,
  Img,
  JobCard,
  OrgLogo,
  StatTile,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/ui/components';
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Cloud,
  Ellipsis,
  Globe,
  MapPin,
  Plus,
  Share,
  Sun,
  Users,
} from '@/ui/icons';
import { deckhand, housekeeper, img, kettleRidge, type SampleJob } from '../_gallery/samples';
import { SeekerTopBar } from './shells';

const noop = () => {};

function LocationGroup({
  place,
  jobCount,
  weather,
  jobs,
}: {
  place: string;
  jobCount: number;
  weather: { icon: typeof Sun; text: string };
  jobs: readonly SampleJob[];
}) {
  const WeatherIcon = weather.icon;
  const titleId = `location-${place.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-17 font-extrabold text-ink">
          {place} <span className="text-14 font-semibold text-muted">· {jobCount} jobs</span>
        </h2>
        <span className="flex items-center gap-1.5 text-13 font-semibold text-ink-2">
          <WeatherIcon className="size-4 text-muted" />
          {weather.text}
        </span>
      </div>
      {jobs.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {jobs.map(({ id, ...job }) => (
            <li key={id}>
              <JobCard {...job} titleAs="h3" hideActions onOpenChip={noop} />
            </li>
          ))}
        </ul>
      ) : null}
      <Button variant="secondary" className="self-start">
        Show all {jobCount} jobs in {place}
      </Button>
    </section>
  );
}

export function HostPageScreen() {
  return (
    <div className="min-h-dvh bg-bg">
      <SeekerTopBar current={null} className="hidden md:block" />
      <main className="mx-auto w-full max-w-6xl pb-16 md:px-8 md:pt-2">
        <div className="relative h-46 overflow-hidden bg-surface-2 md:h-64 md:rounded-2xl">
          <Img
            src={img.lake}
            alt="Mountains and a lake behind Kettle Ridge Lodge"
            className="size-full object-cover"
          />
          <div className="absolute inset-x-2 top-2 flex justify-between md:inset-x-4 md:top-4">
            <IconButton icon={ArrowLeft} label="Back" variant="overlay" className="md:invisible" />
            <div className="flex gap-2">
              <IconButton icon={Share} label="Share" variant="overlay" />
              <IconButton icon={Ellipsis} label="More: report or block" variant="overlay" />
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6">
          <div className="relative -mt-8 flex">
            <OrgLogo name={kettleRidge.name} src={kettleRidge.logoSrc} size="xl" ring />
          </div>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-28 font-extrabold text-ink">{kettleRidge.name}</h1>
                <BadgeCheck
                  role="img"
                  aria-label="Active Explore&Earn host since 2026"
                  className="size-5 text-ink"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">
                  <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                  Hiring now
                </Badge>
                <CategoryBadge category="seasonal" />
                <CategoryBadge category="maritime" />
              </div>
              <p className="flex flex-wrap items-center gap-1.5 text-14 text-ink-2">
                <MapPin className="size-4 text-muted" />
                Seward, AK
                <span className="text-muted">· Member since 2026</span>
              </p>
              <p className="flex items-center gap-1.5 text-14 text-ink-2">
                <Clock className="size-4 text-muted" />
                Usually replies within a day
              </p>
            </div>
            <div className="flex gap-2">
              <Button icon={Plus} className="flex-1 md:flex-none">
                Follow
              </Button>
              <Button variant="secondary" icon={Globe}>
                Website
              </Button>
            </div>
          </div>

          <ul className="mt-5 grid grid-cols-3 gap-2 md:max-w-md">
            {[
              { label: 'Open jobs', value: '6' },
              { label: 'Locations', value: '2' },
              { label: 'Followers', value: '312' },
            ].map((stat) => (
              <li key={stat.label} className="min-w-0">
                <StatTile label={stat.label} value={stat.value} className="p-3" />
              </li>
            ))}
          </ul>
        </div>

        <Tabs defaultValue="jobs" className="mt-6">
          <TabsList aria-label="Host page sections" className="px-4 md:px-6">
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="flex flex-col gap-8 px-4 pt-5 md:px-6">
            <LocationGroup
              place="Seward, AK"
              jobCount={4}
              weather={{ icon: Sun, text: '58°F · Sunny' }}
              jobs={[housekeeper, deckhand]}
            />
            <LocationGroup
              place="Moose Pass, AK"
              jobCount={2}
              weather={{ icon: Cloud, text: '54°F · Cloudy' }}
              jobs={[]}
            />
          </TabsContent>
          <TabsContent value="about" className="flex max-w-2xl flex-col gap-3 px-4 pt-5 md:px-6">
            <p className="text-15 text-ink-2">
              A family-run lodge on Resurrection Bay. Each summer we hire housekeepers, cooks,
              guides and deckhands from across the country, and many come back for another season.
            </p>
            <ul className="flex flex-wrap gap-2">
              {['Staff meals', 'Free kayak days', 'End-of-season bonus'].map((perk) => (
                <li key={perk}>
                  <Badge>{perk}</Badge>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="photos" className="px-4 pt-5 md:px-6">
            <ul className="grid grid-cols-3 gap-2">
              {[
                { src: img.cabin, alt: 'Staff cabin among pines' },
                { src: img.harbor, alt: 'Day-cruise boat in the harbor' },
                { src: img.bedroom, alt: 'Staff bedroom' },
              ].map((photo) => (
                <li key={photo.src}>
                  <Img
                    src={photo.src}
                    alt={photo.alt}
                    className="h-28 w-full rounded-md object-cover md:h-44"
                  />
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="locations" className="flex flex-col gap-2 px-4 pt-5 md:px-6">
            {['Seward, AK · 4 jobs', 'Moose Pass, AK · 2 jobs'].map((place) => (
              <p key={place} className="flex items-center gap-2 text-15 text-ink">
                <MapPin className="size-4 text-muted" />
                {place}
              </p>
            ))}
          </TabsContent>
          <TabsContent value="team" className="px-4 md:px-6">
            <EmptyState icon={Users} title="No team members listed" titleAs="h2" />
          </TabsContent>
          <TabsContent value="faq" className="px-4 md:px-6">
            <EmptyState title="No questions answered yet" titleAs="h2" />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
