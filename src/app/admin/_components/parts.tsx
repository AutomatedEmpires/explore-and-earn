// Layout pieces the console's pages share: page header, panels, status and queue badges.
// Built from the design system's components and token classes only.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Queue, ReviewStatus } from '@/modules/trust';
import { Badge } from '@/ui/components';
import { cn } from '@/ui/cn';
import { CircleAlert, CircleCheck, Clock, TriangleAlert } from '@/ui/icons';
import { formatDateTime, formatRelative, QUEUE_LABEL, STATUS_LABEL } from '../_lib/format';

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex min-h-11 w-fit items-center rounded-sm text-14 font-semibold text-muted no-underline hover:text-ink"
          >
            <span aria-hidden="true" className="mr-1.5">
              &larr;
            </span>
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-28 font-extrabold text-ink">{title}</h1>
        {description ? <div className="text-15 text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  headingLevel = 'h2',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <section className={cn('rounded-xl border border-line bg-surface', className)}>
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Heading className="text-17 font-bold text-ink">{title}</Heading>
            {description ? <p className="text-14 text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'resolved') {
    return (
      <Badge tone="success" icon={CircleCheck}>
        {STATUS_LABEL.resolved}
      </Badge>
    );
  }
  if (status === 'escalated') {
    return (
      <Badge tone="warning" icon={TriangleAlert}>
        {STATUS_LABEL.escalated}
      </Badge>
    );
  }
  return <Badge tone="neutral">{STATUS_LABEL[status]}</Badge>;
}

export function QueueBadge({ queue }: { queue: Queue }) {
  return queue === 'child_safety' ? (
    <Badge tone="danger" icon={CircleAlert}>
      {QUEUE_LABEL[queue]}
    </Badge>
  ) : (
    <Badge tone="neutral">{QUEUE_LABEL[queue]}</Badge>
  );
}

/** When an item's time limit runs out, or that it already has (with an icon, not color alone). */
export function DueLabel({ due, resolved, now }: { due: Date; resolved: boolean; now: Date }) {
  const overdue = !resolved && due.getTime() < now.getTime();
  return (
    <time
      dateTime={due.toISOString()}
      title={formatDateTime(due)}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-14 tabular-nums',
        overdue ? 'font-semibold text-danger' : 'text-ink-2',
      )}
    >
      {overdue ? <TriangleAlert className="size-4" /> : <Clock className="size-4 text-muted" />}
      {resolved
        ? formatDateTime(due)
        : overdue
          ? `Overdue ${formatRelative(due, now)}`
          : `Due ${formatRelative(due, now)}`}
    </time>
  );
}

export function TimeAgo({ at, now }: { at: Date; now: Date }) {
  return (
    <time dateTime={at.toISOString()} title={formatDateTime(at)} className="tabular-nums">
      {formatRelative(at, now)}
    </time>
  );
}

/** A definition list of label and value pairs: two columns from sm up, or one for side panels. */
export function Facts({
  items,
  columns = 2,
}: {
  items: readonly { label: string; value: ReactNode }[];
  columns?: 1 | 2;
}) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', columns === 2 && 'sm:grid-cols-2')}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-13 font-semibold text-muted">{item.label}</dt>
          <dd className="text-15 wrap-anywhere text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const MENTION =
  /@\[([^\]\r\n]{1,100})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** A note's text, with `@[Name](id)` mention tokens shown as "@Name". */
export function NoteBody({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    parts.push(
      <span key={`${index}-${match[2]}`} className="font-semibold text-ink">
        @{match[1]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <p className="text-15 whitespace-pre-wrap break-words text-ink-2">{parts}</p>;
}

/** The table look every console list uses. */
export const tableClass = 'w-full border-collapse text-left text-14';
export const thClass =
  'border-b border-line px-4 py-3 text-13 font-semibold whitespace-nowrap text-muted first:pl-5 last:pr-5';
export const tdClass = 'px-4 py-3 align-middle first:pl-5 last:pr-5';
export const tbodyClass = 'divide-y divide-line';
