'use client';

// The pop-up behind each job-card chip (product spec section 4): a bottom sheet on phones, a
// side panel from 768 px. The Housing one matches the design board's Housing artboard.
import type { ReactNode } from 'react';
import { Badge, Button, Img, Sheet, type JobCardChip } from '@/ui/components';
import { Banknote, BedDouble, Check, ChevronRight, Utensils, type IconComponent } from '@/ui/icons';
import { chipDetails, type SampleJob } from '../_gallery/samples';

const chipMeta: Record<JobCardChip, { title: string; icon: IconComponent; footer: string }> = {
  housing: { title: 'Housing', icon: BedDouble, footer: 'All housing details on the listing' },
  meals: { title: 'Meals', icon: Utensils, footer: 'All meal details on the listing' },
  pay: { title: 'Pay', icon: Banknote, footer: 'Full pay details on the listing' },
};

/** The label-over-value box the sheets open with, like a large chip. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3.5 py-3">
      <p className="text-12 leading-none font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="text-17 font-extrabold text-ink">{value}</p>
    </div>
  );
}

function Provided({ provided, summary }: { provided: boolean; summary: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {provided ? (
        <Badge tone="success" icon={Check}>
          Provided
        </Badge>
      ) : (
        <Badge tone="neutral">Not provided</Badge>
      )}
      <span className="text-14 font-semibold text-ink-2">{summary}</span>
    </div>
  );
}

export function ChipBody({ job, chip }: { job: SampleJob; chip: JobCardChip }) {
  const details = chipDetails[job.id];
  if (chip === 'housing') {
    const housing = details?.housing;
    if (!job.housing.provided || !housing) {
      return (
        <div className="flex flex-col gap-4">
          <Provided provided={false} summary="No housing with this job" />
          <p className="text-15 text-ink-2">
            Ask the host about places to stay nearby when you apply.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <Provided provided summary={housing.summary} />
        {housing.cost ? <Fact label="Cost" value={housing.cost} /> : null}
        {housing.photos ? (
          <ul className="grid grid-cols-2 gap-2">
            {housing.photos.map((photo) => (
              <li key={photo.src + photo.alt}>
                <Img
                  src={photo.src}
                  alt={photo.alt}
                  className="h-30 w-full rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-15 text-ink-2">{housing.note}</p>
      </div>
    );
  }
  if (chip === 'meals') {
    const meals = details?.meals;
    return (
      <div className="flex flex-col gap-4">
        <Provided
          provided={job.meals.provided}
          summary={
            meals?.summary ?? (job.meals.provided ? 'Meals included' : 'No meals with this job')
          }
        />
        {meals?.cost ? <Fact label="Cost" value={meals.cost} /> : null}
        {meals ? <p className="text-15 text-ink-2">{meals.note}</p> : null}
      </div>
    );
  }
  const pay = details?.pay;
  return (
    <div className="flex flex-col gap-4">
      <Fact label="Rate" value={pay?.rate ?? 'See the listing'} />
      {pay ? (
        <ul className="flex flex-col gap-2">
          {pay.lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-15 text-ink-2">
              <Check className="mt-1 size-4 shrink-0 text-ink" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type ChipContent = { job: SampleJob; chip: JobCardChip };

/**
 * The sheet for one chip. Controlled (`open` and `onOpenChange`) for the cards, which keep the
 * last chip as `content` while it closes; or uncontrolled with a `trigger`.
 */
export function ChipSheet({
  content,
  open,
  onOpenChange,
  trigger,
}: {
  content: ChipContent | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  if (!content) return null;
  const { job, chip } = content;
  const meta = chipMeta[chip];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={meta.title}
      description={`${job.position} · ${job.host.name}`}
      icon={meta.icon}
      footer={
        <Button asChild variant="secondary" size="lg" fullWidth>
          <a href={job.href}>
            {meta.footer}
            <ChevronRight className="size-4" />
          </a>
        </Button>
      }
    >
      <ChipBody job={job} chip={chip} />
    </Sheet>
  );
}
