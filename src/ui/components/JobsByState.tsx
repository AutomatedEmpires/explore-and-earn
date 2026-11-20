'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/ui/cn';
import { ArrowRight } from '@/ui/icons';
import { US_MAP_VIEW, US_STATE_OUTLINES } from '@/ui/maps/us-states';

export type JobsByStateProps = {
  /** Open jobs by postal code. A missing code, or 0, is shown as coming soon. */
  openJobs: Readonly<Record<string, number>>;
  /** The "All jobs" link. */
  allJobsHref?: string;
  /** Where a state with open jobs goes. Defaults to `/?state=CODE`. */
  stateHref?: (code: string) => string;
};

const OPEN = 'var(--color-farm-solid)';
const SOON = 'var(--color-surface-2)';
const ACTIVE = 'var(--color-ink)';
const LINE = 'var(--color-surface)';

function jobsLabel(count: number): string {
  if (count <= 0) return 'Coming soon';
  return count === 1 ? '1 open job' : `${count} open jobs`;
}

/**
 * Browse jobs by state: a hoverable US map. States with open jobs use Farm green;
 * the rest are "Coming soon". Hover and keyboard focus turn the state ink-black and
 * show its name and count.
 */
export function JobsByState({
  openJobs,
  allJobsHref = '/',
  stateHref = (code) => `/?state=${code}`,
}: JobsByStateProps) {
  const router = useRouter();
  const headingId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const openStates = US_STATE_OUTLINES.filter((s) => (openJobs[s.code] ?? 0) > 0).length;
  const activeState = US_STATE_OUTLINES.find((s) => s.code === active);
  const activeCount = active ? (openJobs[active] ?? 0) : 0;

  function place(target: SVGPathElement) {
    const box = frame.current?.getBoundingClientRect();
    const pathBox = target.getBoundingClientRect();
    if (!box) return;
    const y = pathBox.top - box.top;
    setTip({
      x: pathBox.left + pathBox.width / 2 - box.left,
      y,
      above: y > 72,
    });
  }

  function show(code: string, target: SVGPathElement) {
    setActive(code);
    place(target);
  }

  function hide() {
    setActive(null);
    setTip(null);
  }

  function activate(code: string, count: number) {
    if (count > 0) router.push(stateHref(code));
  }

  function onKey(event: KeyboardEvent<SVGPathElement>, code: string, count: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(code, count);
    }
  }

  return (
    <section aria-labelledby={headingId} className="bg-surface text-ink">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-12 font-bold tracking-wider text-farm-fg uppercase">Browse by state</p>
          <h2 id={headingId} className="mt-1 text-32 font-extrabold tracking-tight text-ink">
            Jobs by state
          </h2>
        </div>
        <a
          href={allJobsHref}
          className="inline-flex items-center gap-1.5 pb-1 text-13 font-semibold tracking-wider text-ink uppercase no-underline hover:text-farm-fg"
        >
          All jobs
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>

      <div ref={frame} className="relative mt-8">
        <svg
          viewBox={`0 0 ${US_MAP_VIEW.width} ${US_MAP_VIEW.height}`}
          role="group"
          aria-label="United States, jobs by state"
          className="h-auto w-full"
        >
          {US_STATE_OUTLINES.map((state) => {
            const count = openJobs[state.code] ?? 0;
            const on = active === state.code;
            return (
              <path
                key={state.code}
                d={state.d}
                tabIndex={0}
                role={count > 0 ? 'link' : 'button'}
                aria-label={`${state.name}, ${jobsLabel(count)}`}
                className="cursor-pointer outline-none motion-safe:transition-colors motion-safe:duration-150"
                style={{
                  fill: on ? ACTIVE : count > 0 ? OPEN : SOON,
                  stroke: on ? 'var(--color-focus)' : LINE,
                  strokeWidth: on ? 2.5 : 1.4,
                }}
                onPointerEnter={(event: PointerEvent<SVGPathElement>) =>
                  show(state.code, event.currentTarget)
                }
                onPointerMove={(event: PointerEvent<SVGPathElement>) =>
                  show(state.code, event.currentTarget)
                }
                onPointerLeave={hide}
                onFocus={(event) => show(state.code, event.currentTarget)}
                onBlur={hide}
                onClick={() => activate(state.code, count)}
                onKeyDown={(event) => onKey(event, state.code, count)}
              />
            );
          })}
        </svg>

        {activeState && tip ? (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute z-10 -translate-x-1/2 rounded-sm bg-ink px-3 py-2 text-on-primary shadow-raised',
              tip.above && '-translate-y-full',
            )}
            style={{
              left: tip.x,
              top: tip.above ? tip.y - 8 : tip.y + 28,
            }}
          >
            <p className="text-14 font-bold">{activeState.name}</p>
            <p className="text-13">{jobsLabel(activeCount)}</p>
          </div>
        ) : null}
      </div>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-13 text-ink-2">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-farm-solid" aria-hidden />
          Open jobs now ({openStates} {openStates === 1 ? 'state' : 'states'})
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-surface-2 ring-1 ring-line" aria-hidden />
          Coming soon
        </li>
      </ul>
    </section>
  );
}
