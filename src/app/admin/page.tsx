// Console Home (spec section 12): review items by queue and status, the operator's own open
// items and the latest alerts. Business numbers (sign-ups, revenue) arrive with later
// sub-projects.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { searchAudit } from '@/modules/audit';
import { listReviewItems, queueCounts } from '@/modules/operator';
import { Button, EmptyState, StatTile } from '@/ui/components';
import { CircleAlert, CircleCheck, Clock, Inbox, ListChecks, TriangleAlert } from '@/ui/icons';
import {
  DueLabel,
  PageHeader,
  Panel,
  QueueBadge,
  StatusBadge,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  TimeAgo,
} from './_components/parts';
import { QUEUE_DESCRIPTION, QUEUE_LABEL, subjectLabel } from './_lib/format';
import { requireConsoleOperator } from './_lib/session';

export const metadata: Metadata = { title: 'Home' };

function alertText(data: Record<string, unknown> | null): { message: string; critical: boolean } {
  const message = typeof data?.message === 'string' ? data.message : 'An alert was raised.';
  return { message, critical: data?.severity === 'critical' };
}

export default async function ConsoleHome() {
  const operator = await requireConsoleOperator();
  const db = getDb();
  const now = new Date();
  const counts = await queueCounts(db, now);
  const mine = await listReviewItems(db, {
    assigneeId: operator.user.id,
    status: 'unresolved',
    limit: 8,
  });
  const alerts = await searchAudit(db, { action: 'trust.alert', limit: 5 });

  const total = (key: 'open' | 'assigned' | 'escalated' | 'overdue' | 'resolvedToday') =>
    counts.reduce((sum, c) => sum + c[key], 0);
  const waiting = total('open') + total('assigned') + total('escalated');

  return (
    <>
      <PageHeader title="Home" description="What needs a person today." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for review" value={waiting} icon={ListChecks} />
        <StatTile label="Unassigned" value={total('open')} icon={Inbox} />
        <StatTile
          label="Overdue"
          value={total('overdue')}
          icon={TriangleAlert}
          hint={total('overdue') > 0 ? 'Past their time limit' : 'Nothing overdue'}
        />
        <StatTile label="Resolved in 24 hours" value={total('resolvedToday')} icon={CircleCheck} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel
          title="Queues"
          description="Items waiting in each queue, by status."
          className="lg:col-span-3"
          bodyClassName="p-0"
        >
          <div className="relative overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Queue
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Unassigned
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Assigned
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Escalated
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Overdue
                  </th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {counts.map((c) => (
                  <tr key={c.queue}>
                    <th scope="row" className={`${tdClass} font-normal`}>
                      <Link
                        href={`/queues?queue=${c.queue}`}
                        className="inline-flex min-h-11 flex-col justify-center rounded-sm text-ink no-underline hover:underline"
                      >
                        <span className="text-15 font-semibold">{QUEUE_LABEL[c.queue]}</span>
                        <span className="text-13 text-muted">{QUEUE_DESCRIPTION[c.queue]}</span>
                      </Link>
                    </th>
                    <td className={`${tdClass} text-right tabular-nums`}>{c.open}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{c.assigned}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{c.escalated}</td>
                    <td
                      className={`${tdClass} text-right tabular-nums ${c.overdue > 0 ? 'font-bold text-danger' : ''}`}
                    >
                      {c.overdue > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert className="size-4" />
                          {c.overdue}
                        </span>
                      ) : (
                        0
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel
            title="Your open items"
            actions={
              <Button asChild variant="secondary">
                <Link href="/queues?mine=1">See all</Link>
              </Button>
            }
            bodyClassName="p-0"
          >
            {mine.items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nothing assigned to you"
                description="Claim an item from the review queues, or go on shift to receive new ones."
                titleAs="h3"
                className="py-8"
              />
            ) : (
              <ul>
                {mine.items.map((item) => (
                  <li key={item.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/queues/${item.id}`}
                      className="flex min-h-11 flex-col gap-1.5 px-5 py-3 no-underline hover:bg-surface-2"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <QueueBadge queue={item.queue} />
                        <StatusBadge status={item.status} />
                      </span>
                      <span className="text-15 font-semibold text-ink">
                        {subjectLabel(item.subjectType)}: {item.reason}
                      </span>
                      <DueLabel due={item.slaDueAt} resolved={false} now={now} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent alerts" bodyClassName="p-0">
            {alerts.items.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No alerts"
                description="Child-safety matches and overdue items that nobody can take show up here."
                titleAs="h3"
                className="py-8"
              />
            ) : (
              <ul>
                {alerts.items.map((alert) => {
                  const { message, critical } = alertText(alert.data);
                  return (
                    <li
                      key={alert.id}
                      className="flex gap-3 border-b border-line px-5 py-3 last:border-b-0"
                    >
                      {critical ? (
                        <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
                      ) : (
                        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-15 text-ink">
                          <span className="sr-only">{critical ? 'Critical: ' : 'Warning: '}</span>
                          {message}
                        </p>
                        <p className="text-13 text-muted">
                          <TimeAgo at={alert.createdAt} now={now} />
                          {alert.subjectType === 'review_item' && alert.subjectId ? (
                            <>
                              {' · '}
                              <Link
                                href={`/queues/${alert.subjectId}`}
                                className="text-ink underline underline-offset-2"
                              >
                                Open the item
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
