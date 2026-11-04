// Review queues (spec section 12): every item waiting for a person, most urgent first, with
// filters for queue, status and "assigned to me", and Claim for unassigned items. An operator
// sees only the queues they cover (Owners cover every queue), plus any decision waiting for a
// second sign-off they could give; another queue's page does not exist for them. Outside prod
// it also has the "Create test item" button, which sends a flagged text through the real check.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import {
  coversQueue,
  isQueue,
  isStatusFilter,
  listReviewItems,
  REVIEW_STATUSES,
} from '@/modules/operator';
import { QUEUES } from '@/modules/trust';
import { Avatar, EmptyState } from '@/ui/components';
import { ListChecks } from '@/ui/icons';
import { ClaimButton, CreateTestItemButton } from '../_components/ItemButtons';
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
} from '../_components/parts';
import { QueueFilters } from '../_components/QueueFilters';
import {
  formatScore,
  QUEUE_LABEL,
  RESOLUTION_LABEL,
  STATUS_LABEL,
  subjectLabel,
} from '../_lib/format';
import { itemViewer } from '../_lib/access';
import { requireConsoleOperator } from '../_lib/session';

export const metadata: Metadata = { title: 'Review queues' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function QueuesPage({ searchParams }: { searchParams: SearchParams }) {
  const operator = await requireConsoleOperator();
  const params = await searchParams;
  const queueParam = one(params.queue);
  const statusParam = one(params.status);
  const queue = isQueue(queueParam) ? queueParam : undefined;
  const status = isStatusFilter(statusParam) ? statusParam : 'unresolved';
  const mine = one(params.mine) === '1';
  const viewer = itemViewer(operator);
  if (queue && !coversQueue(viewer, queue)) notFound();
  const queues = QUEUES.filter((q) => coversQueue(viewer, q));
  const allQueues = viewer.role === 'owner' ? 'All queues' : 'All your queues';

  const now = new Date();
  const { items, total } = await listReviewItems(getDb(), {
    ...(queue ? { queue } : {}),
    visibleTo: viewer,
    status,
    ...(mine ? { assigneeId: operator.user.id } : {}),
    limit: 100,
  });
  const showTestItems = getEnv().APP_ENV !== 'prod';

  return (
    <>
      <PageHeader
        title="Review queues"
        description="Items the automatic checks could not decide, most urgent first."
        actions={showTestItems ? <CreateTestItemButton /> : undefined}
      />

      <QueueFilters
        queues={[
          { value: 'all', label: allQueues },
          ...queues.map((q) => ({ value: q, label: QUEUE_LABEL[q] })),
        ]}
        statuses={[
          { value: 'unresolved', label: 'Waiting for review' },
          ...REVIEW_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          { value: 'all', label: 'All statuses' },
        ]}
        queue={queue ?? 'all'}
        status={status}
        mine={mine}
      />

      <Panel
        className="mt-6"
        bodyClassName="p-0"
        title={queue ? QUEUE_LABEL[queue] : allQueues}
        description={
          total > items.length
            ? `Showing the ${items.length} most urgent of ${total} items`
            : `${total} ${total === 1 ? 'item' : 'items'}`
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nothing here"
            description={
              mine
                ? 'No items are assigned to you with these filters.'
                : 'No items match these filters.'
            }
            titleAs="h3"
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={`${tableClass} min-w-3xl`}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Item
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    AI score
                  </th>
                  <th scope="col" className={thClass}>
                    Time limit
                  </th>
                  <th scope="col" className={thClass}>
                    Assignee
                  </th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {items.map((item) => {
                  const summaryId = `item-${item.id}`;
                  return (
                    <tr key={item.id} className="hover:bg-surface-2">
                      <td className={tdClass}>
                        <div className="flex flex-col gap-1.5">
                          <QueueBadge queue={item.queue} />
                          <Link
                            id={summaryId}
                            href={`/queues/${item.id}`}
                            className="inline-flex min-h-11 w-fit max-w-md items-center rounded-sm text-15 font-semibold text-ink underline-offset-2 hover:underline"
                          >
                            {subjectLabel(item.subjectType)}: {item.reason}
                          </Link>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={item.status} />
                          {item.resolution ? (
                            <span className="text-13 text-muted">
                              {RESOLUTION_LABEL[item.resolution]}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={`${tdClass} text-right tabular-nums`}>
                        {item.aiConfidence === null ? (
                          <span className="text-muted">None</span>
                        ) : (
                          formatScore(item.aiConfidence)
                        )}
                      </td>
                      <td className={tdClass}>
                        <DueLabel
                          due={
                            item.status === 'resolved' && item.resolvedAt
                              ? item.resolvedAt
                              : item.slaDueAt
                          }
                          resolved={item.status === 'resolved'}
                          now={now}
                        />
                      </td>
                      <td className={tdClass}>
                        {item.assigneeId ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={item.assigneeName ?? 'Operator'} size="sm" decorative />
                            <span className="whitespace-nowrap text-ink-2">
                              {item.assigneeId === operator.user.id ? 'You' : item.assigneeName}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">Nobody yet</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {item.status === 'open' ? (
                          <ClaimButton
                            itemId={item.id}
                            variant="secondary"
                            describedBy={summaryId}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
