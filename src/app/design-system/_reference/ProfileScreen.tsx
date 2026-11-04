'use client';

// The design board's seeker Profile artboard (product spec section 9.3): header, availability,
// my jobs, resume, visibility and links. No completeness bar.
import { useState, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Avatar, Badge, Button, Img, SegmentedControl, Switch } from '@/ui/components';
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  Inbox,
  MapPin,
  Pencil,
  Send,
  Settings,
  ShieldCheck,
  X,
  type IconComponent,
} from '@/ui/icons';
import { img, maya } from '../_gallery/samples';
import { SeekerBottomNav, SeekerTopBar } from './shells';

const myJobs: { label: string; count: number; icon: IconComponent; fresh?: number }[] = [
  { label: 'Saved', count: 14, icon: Bookmark },
  { label: 'Applied', count: 5, icon: Send },
  { label: 'Interviews', count: 1, icon: CalendarDays },
  { label: 'Offers', count: 0, icon: FileText },
  { label: 'Invites', count: 2, icon: Inbox, fresh: 2 },
  { label: 'Skipped', count: 31, icon: X },
];

const links: { label: string; icon: IconComponent; detail?: string }[] = [
  { label: 'Job alerts', icon: Bell, detail: '3 saved searches' },
  { label: 'Privacy and data', icon: ShieldCheck },
  { label: 'Settings', icon: Settings },
];

type Template = 'classic' | 'compact';

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      {children}
    </section>
  );
}

export function ProfileScreen() {
  const [template, setTemplate] = useState<Template>('classic');
  const name = `${maya.firstName} ${maya.lastName}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SeekerTopBar current="profile" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 pt-1 pb-8 md:px-8 md:pt-4">
        <section className="overflow-hidden rounded-xl bg-surface shadow-card">
          <div className="relative h-33 bg-surface-2 md:h-56">
            <Img
              src={img.harbor}
              alt="Your cover photo: a boat in a harbor at dusk"
              className="size-full object-cover"
            />
            <div className="absolute -bottom-7 left-4 flex">
              <Avatar name={name} src={maya.avatarSrc} size="xl" ring />
            </div>
          </div>
          <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
            <div className="flex justify-end">
              <Button asChild variant="secondary">
                <a href="#edit-profile">
                  <Pencil className="size-4" />
                  Edit profile
                </a>
              </Button>
            </div>
            <h1 className="text-24 font-extrabold text-ink">{name}</h1>
            <p className="text-15 text-ink-2">Housekeeping lead · 3 summers in Alaska</p>
            <p className="mt-1 flex items-center gap-1.5 text-14 text-muted">
              <MapPin className="size-4" />
              {maya.location}
            </p>
          </div>
        </section>

        <Panel className="flex items-center gap-3 px-4 py-3.5">
          <span className="flex size-10.5 shrink-0 items-center justify-center rounded-md bg-success-bg text-success">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-15 font-bold text-balance text-ink">
              Available from {maya.availableFrom}
            </p>
            <p className="text-13 text-muted">Confirmed 4 days ago</p>
          </div>
          <Button variant="secondary">Update</Button>
        </Panel>

        <section aria-labelledby="my-jobs" className="flex flex-col gap-3 pt-4">
          <h2 id="my-jobs" className="text-17 font-extrabold text-ink">
            My jobs
          </h2>
          <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {myJobs.map(({ label, count, icon: Icon, fresh }) => (
              <li key={label}>
                <a
                  href={`#${label.toLowerCase()}`}
                  className="relative flex h-21 flex-col justify-between rounded-xl border border-line bg-surface p-3 text-ink no-underline hover:bg-surface-2 motion-safe:transition-colors"
                >
                  <Icon className="size-5" />
                  {fresh ? (
                    <Badge size="sm" tone="inverse" className="absolute top-3 right-3">
                      {fresh} new
                    </Badge>
                  ) : null}
                  <span className="text-14 font-semibold">
                    {label} <span className="font-extrabold">{count}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <Panel className="mt-4 flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-17 font-extrabold text-ink">Resume</h2>
            <p className="text-13 text-muted">
              Your profile is your resume. Pick a look for the PDF.
            </p>
          </div>
          <SegmentedControl<Template>
            label="Resume template"
            value={template}
            onValueChange={setTemplate}
            options={[
              { value: 'classic', label: 'Classic' },
              { value: 'compact', label: 'Compact' },
            ]}
            className="self-start"
          />
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} className="flex-1 md:flex-none">
              Download PDF
            </Button>
            <Button variant="secondary">Upload instead</Button>
          </div>
        </Panel>

        <Panel className="divide-y divide-line px-4">
          <Switch
            label="Visible to hosts"
            description="Hosts can find you and send job invites"
            defaultChecked
            className="py-3"
          />
          <Switch
            label="Show my photo to hosts"
            description="Off shows your initials instead"
            defaultChecked
            className="py-3"
          />
        </Panel>

        <Panel>
          <ul className="divide-y divide-line">
            {links.map(({ label, icon: Icon, detail }) => (
              <li key={label}>
                <a
                  href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className="flex min-h-13 items-center gap-3 rounded-xl px-4 text-15 font-semibold text-ink no-underline hover:bg-surface-2"
                >
                  <Icon className="size-5" />
                  <span className="flex-1">{label}</span>
                  {detail ? <span className="text-13 font-normal text-muted">{detail}</span> : null}
                  <ChevronRight className="size-4 text-muted" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </main>
      <SeekerBottomNav current="profile" />
    </div>
  );
}
