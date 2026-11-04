// The audit log (spec section 12): every operator action and sensitive change, permanent and
// searchable, newest first, 50 to a page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { searchAudit, type AuditSearch } from '@/modules/audit';
import { listOperators } from '@/modules/operator';
import { Button, EmptyState, ErrorState, Input } from '@/ui/components';
import { FileText } from '@/ui/icons';
import { PageHeader, Panel, tableClass, tbodyClass, tdClass, thClass } from '../_components/parts';
import { formatDateTime } from '../_lib/format';
import { requireConsoleOperator } from '../_lib/session';

export const metadata: Metadata = { title: 'Audit log' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS = ['action', 'actorId', 'subjectType', 'subjectId', 'from', 'to'] as const;
type FilterKey = (typeof FILTERS)[number];

const PAGE_SIZE = 50;

function text(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

/** "2026-11-03" as the start of that day in UTC (or of the next day, for an exclusive end). */
function day(value: string, end: boolean): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return end ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
}

function summarize(data: Record<string, unknown> | null): string {
  if (!data || Object.keys(data).length === 0) return '';
  return JSON.stringify(data, null, 2);
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const operator = await requireConsoleOperator();
  const params = await searchParams;
  const values = Object.fromEntries(FILTERS.map((k) => [k, text(params[k])])) as Record<
    FilterKey,
    string
  >;
  const before = text(params.before);

  const filter: AuditSearch = { limit: PAGE_SIZE };
  if (values.action) filter.action = values.action;
  if (values.actorId) filter.actorId = values.actorId;
  if (values.subjectType) filter.subjectType = values.subjectType;
  if (values.subjectId) filter.subjectId = values.subjectId;
  const from = day(values.from, false);
  const to = day(values.to, true);
  if (from) filter.from = from;
  if (to) filter.to = to;
  if (before) filter.before = before;

  const db = getDb();
  const result = await searchAudit(db, filter).catch((err: unknown) => {
    if (isAppError(err) && err.code === 'bad_request') return { error: err.message } as const;
    throw err;
  });
  const operators = await listOperators(db);
  const names = new Map(operators.map((o) => [o.userId, o.name]));
  const filtered = FILTERS.some((k) => values[k] !== '');

  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const k of FILTERS) if (values[k]) q.set(k, values[k]);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const s = q.toString();
    return s ? `/audit?${s}` : '/audit';
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every operator action and sensitive change. Entries can never be edited or deleted."
      />

      <Panel title="Search" headingLevel="h2">
        <form method="get" action="/audit" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              name="action"
              label="Action"
              placeholder="trust.decided"
              defaultValue={values.action}
            />
            <Input
              name="subjectType"
              label="Subject type"
              placeholder="review_item"
              defaultValue={values.subjectType}
            />
            <Input name="subjectId" label="Subject id" defaultValue={values.subjectId} />
            <Input
              name="actorId"
              label="Actor id"
              placeholder="An operator or user id"
              defaultValue={values.actorId}
            />
            <Input name="from" type="date" label="From (UTC)" defaultValue={values.from} />
            <Input name="to" type="date" label="To (UTC)" defaultValue={values.to} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Search</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/audit">Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel
        className="mt-6"
        bodyClassName="p-0"
        title={filtered ? 'Matching events' : 'Latest events'}
      >
        {'error' in result ? (
          <ErrorState
            title="Check the search"
            description={result.error}
            announce="none"
            titleAs="h3"
          />
        ) : result.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No events"
            description="Nothing matches this search."
            titleAs="h3"
          />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className={`${tableClass} min-w-3xl`}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>
                      Time (UTC)
                    </th>
                    <th scope="col" className={thClass}>
                      Action
                    </th>
                    <th scope="col" className={thClass}>
                      Actor
                    </th>
                    <th scope="col" className={thClass}>
                      Subject
                    </th>
                    <th scope="col" className={thClass}>
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {result.items.map((event) => {
                    const details = summarize(event.data);
                    return (
                      <tr key={event.id} className="align-top">
                        <td className={`${tdClass} whitespace-nowrap text-ink-2 tabular-nums`}>
                          {formatDateTime(event.createdAt).replace(' UTC', '')}
                        </td>
                        <td className={`${tdClass} font-mono text-13 font-semibold text-ink`}>
                          {event.action}
                        </td>
                        <td className={tdClass}>
                          <span className="flex flex-col">
                            <span className="text-ink">
                              {event.actorId
                                ? event.actorId === operator.user.id
                                  ? 'You'
                                  : (names.get(event.actorId) ?? 'A user')
                                : 'System'}
                            </span>
                            <span className="text-13 text-muted">{event.actorType}</span>
                          </span>
                        </td>
                        <td className={tdClass}>
                          <span className="flex flex-col">
                            <span className="text-ink">{event.subjectType}</span>
                            {event.subjectId ? (
                              event.subjectType === 'review_item' ? (
                                <Link
                                  href={`/queues/${event.subjectId}`}
                                  className="font-mono text-13 text-ink-2 underline underline-offset-2"
                                >
                                  {event.subjectId}
                                </Link>
                              ) : (
                                <span className="font-mono text-13 break-all text-muted">
                                  {event.subjectId}
                                </span>
                              )
                            ) : null}
                          </span>
                        </td>
                        <td className={tdClass}>
                          {details ? (
                            <details>
                              <summary className="min-h-11 cursor-pointer rounded-sm py-2 text-14 font-semibold text-ink">
                                Show data
                              </summary>
                              <pre className="mt-2 max-w-md overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-12 text-ink-2">
                                {details}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-muted">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Pages"
              className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4"
            >
              {before ? (
                <Button asChild variant="ghost">
                  <Link href={query({})}>Newest</Link>
                </Button>
              ) : null}
              {result.nextBefore ? (
                <Button asChild variant="secondary">
                  <Link href={query({ before: result.nextBefore })}>Older events</Link>
                </Button>
              ) : (
                <p className="flex min-h-11 items-center text-14 text-muted">No older events</p>
              )}
            </nav>
          </>
        )}
      </Panel>
    </>
  );
}
