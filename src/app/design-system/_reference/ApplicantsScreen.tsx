'use client';

// The design board's candidate card artboard: host Applicants, where the shared card is filled
// with a candidate. Phones get the host top bar and bottom tabs; desktop gets the sidebar.
import { useState } from 'react';
import { CandidateCard, Pill, Select } from '@/ui/components';
import { applicants } from '../_gallery/samples';
import { HostBottomNav, HostSidebar, HostTopBar } from './shells';

const stages = [
  { id: 'new', label: 'New', count: 8 },
  { id: 'shortlisted', label: 'Shortlisted', count: 5 },
  { id: 'interview', label: 'Interview', count: 3 },
  { id: 'hired', label: 'Hired', count: 1 },
] as const;

const listings = [
  { value: 'housekeeper', label: 'Lodge Housekeeper · 24 applicants' },
  { value: 'line-cook', label: 'Line Cook · 8 applicants' },
  { value: 'deckhand', label: 'Deckhand, day cruises · 9 applicants' },
] as const;

type Listing = (typeof listings)[number]['value'];

export function ApplicantsScreen() {
  const [stage, setStage] = useState<(typeof stages)[number]['id']>('new');
  const [shortlisted, setShortlisted] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className="flex min-h-dvh bg-bg">
      <HostSidebar current="applicants" />
      <div className="flex min-w-0 flex-1 flex-col">
        <HostTopBar />
        <main className="w-full max-w-6xl flex-1 px-4 pt-1.5 pb-8 md:px-8 md:pt-8">
          <h1 className="text-28 font-extrabold text-ink">Applicants</h1>
          <Select<Listing>
            label="Listing"
            hideLabel
            options={listings}
            defaultValue="housekeeper"
            className="mt-2 max-w-sm"
          />
          <div
            role="group"
            aria-label="Stage"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3 pb-1 md:mx-0 md:px-0"
          >
            {stages.map((s) => (
              <Pill
                key={s.id}
                selected={stage === s.id}
                count={s.count}
                onClick={() => setStage(s.id)}
              >
                {s.label}
              </Pill>
            ))}
          </div>
          <ul className="mt-3 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {applicants.map(({ id, ...candidate }) => (
              <li key={id}>
                <CandidateCard
                  {...candidate}
                  shortlisted={shortlisted.has(id)}
                  onShortlist={() =>
                    setShortlisted((s) => {
                      const next = new Set(s);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onOpenChip={() => {}}
                />
              </li>
            ))}
          </ul>
        </main>
        <HostBottomNav current="applicants" />
      </div>
    </div>
  );
}
