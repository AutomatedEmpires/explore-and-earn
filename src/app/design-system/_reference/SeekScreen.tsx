'use client';

// The design board's Seek artboard: search, category filters and job cards. Every chip opens
// its pop-up sheet. The Housing reference opens with the Housing sheet showing.
import { useState } from 'react';
import { categories, categoryMeta, type Category } from '@/ui/categories';
import { Button, EmptyState, IconButton, Input, JobCard, Pill } from '@/ui/components';
import { ChevronDown, Search, SlidersHorizontal } from '@/ui/icons';
import { seekJobs } from '../_gallery/samples';
import { ChipSheet, type ChipContent } from './ChipSheet';
import { SeekerBottomNav, SeekerTopBar } from './shells';

export function SeekScreen({ initialSheet = null }: { initialSheet?: ChipContent | null }) {
  const [sheet, setSheet] = useState<ChipContent | null>(initialSheet);
  const [sheetOpen, setSheetOpen] = useState(initialSheet !== null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());

  const jobs = filter === 'all' ? seekJobs : seekJobs.filter((j) => j.category === filter);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SeekerTopBar current="seek" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 md:px-8">
        <h1 className="sr-only">Seek</h1>
        <div className="flex gap-2 pt-1 md:max-w-2xl md:pt-4">
          <Input
            label="Search jobs"
            hideLabel
            type="search"
            leadingIcon={Search}
            placeholder="Search jobs, places, employers"
            fieldClassName="min-w-0 flex-1"
          />
          <IconButton icon={SlidersHorizontal} label="Filters" variant="outline" size="lg" />
        </div>

        <div
          role="group"
          aria-label="Category"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3 pb-1 md:mx-0 md:px-0"
        >
          <Pill selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Pill>
          {categories.map((c) => (
            <Pill key={c} category={c} selected={filter === c} onClick={() => setFilter(c)}>
              {categoryMeta[c].label}
            </Pill>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 pb-1">
          <p className="text-13 text-muted">1,284 jobs across the US</p>
          <Button variant="ghost" className="-mr-3 px-3">
            Sort: Relevant
            <ChevronDown className="size-4" />
          </Button>
        </div>

        {jobs.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map(({ id, ...job }) => (
              <li key={id}>
                <JobCard
                  {...job}
                  saved={saved.has(id)}
                  onSave={() =>
                    setSaved((s) => {
                      const next = new Set(s);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onOpenChip={(chip) => {
                    setSheet({ job: { id, ...job }, chip });
                    setSheetOpen(true);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={categoryMeta[filter === 'all' ? 'seasonal' : filter].icon}
            title={`No ${filter === 'all' ? '' : categoryMeta[filter].label.toLowerCase() + ' '}jobs here yet`}
            description="Try another category, or widen your search."
            action={
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Show all jobs
              </Button>
            }
          />
        )}
      </main>
      <SeekerBottomNav current="seek" />
      <ChipSheet content={sheet} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
