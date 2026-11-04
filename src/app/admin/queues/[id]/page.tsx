// One review item (spec section 12): a preview of the subject, the AI's reason and confidence,
// the decisions, internal notes with @mentions, escalate and hand off, and a decision waiting
// for a second sign-off.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { searchAudit } from '@/modules/audit';
import { getMediaUrl, getStorage } from '@/modules/media';
import {
  getReviewItem,
  listOperators,
  mediaSubject,
  testItemText,
  type ItemDetail,
  type OperatorSummary,
} from '@/modules/operator';
import { getSetting } from '@/modules/settings';
import type { OperatorContext } from '@/server/guards';
import { Avatar, Badge, EmptyState, Img } from '@/ui/components';
import { CircleCheck, FileText, MessageSquare, Sparkles } from '@/ui/icons';
import { DecisionPanel } from '../../_components/DecisionPanel';
import { ClaimButton } from '../../_components/ItemButtons';
import { NoteForm } from '../../_components/NoteForm';
import {
  DueLabel,
  Facts,
  NoteBody,
  PageHeader,
  Panel,
  QueueBadge,
  StatusBadge,
  TimeAgo,
} from '../../_components/parts';
import { EscalateForm, HandOffForm } from '../../_components/RoutingForms';
import { SecondSignOff } from '../../_components/SecondSignOff';
import {
  ACTION_LABEL,
  actionsFor,
  formatCents,
  formatDateTime,
  formatScore,
  QUEUE_LABEL,
  RESOLUTION_LABEL,
  shortId,
  subjectLabel,
} from '../../_lib/format';
import { requireConsoleOperator } from '../../_lib/session';

export const metadata: Metadata = { title: 'Review item' };

type Params = Promise<{ id: string }>;

function covers(op: Pick<OperatorSummary, 'role' | 'queues'>, queue: ItemDetail['queue']) {
  return op.role === 'owner' || op.queues.includes(queue);
}

async function SubjectPreview({ item, operator }: { item: ItemDetail; operator: OperatorContext }) {
  const db = getDb();
  if (item.subjectType === 'test_item') {
    const text = await testItemText(db, item.subjectId);
    return text ? (
      <blockquote className="rounded-lg bg-surface-2 px-4 py-3 text-15 whitespace-pre-wrap text-ink">
        {text}
      </blockquote>
    ) : (
      <p className="text-15 text-muted">The text of this test item was not kept.</p>
    );
  }

  if (item.subjectType === 'media') {
    const file = await mediaSubject(db, item.subjectId);
    if (!file) return <p className="text-15 text-muted">This upload no longer exists.</p>;
    let url: string | null = null;
    try {
      url = await getMediaUrl(
        db,
        getStorage(),
        { userId: operator.user.id, orgIds: [], isOperator: true },
        item.subjectId,
        file.isImage ? 640 : undefined,
      );
    } catch {
      url = null;
    }
    return (
      <div className="flex flex-col gap-3">
        {url && file.isImage ? (
          <Img
            src={url}
            alt={file.altText ?? 'The uploaded image under review'}
            className="max-h-96 w-full rounded-lg bg-surface-2 object-contain"
          />
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-fit items-center gap-2 text-15 font-semibold text-ink underline underline-offset-2"
          >
            <FileText className="size-5" />
            Open the file
          </a>
        ) : (
          <p className="text-15 text-muted">
            {file.status === 'blocked'
              ? 'Blocked by the child-safety check. The file is never shown.'
              : 'The file cannot be shown right now.'}
          </p>
        )}
        <p className="text-13 text-muted">
          {file.kind.replace(/_/g, ' ')} · {file.mime ?? 'unknown type'} · {file.status}
          {file.rejectionReason ? ` (${file.rejectionReason})` : ''}
        </p>
      </div>
    );
  }

  return (
    <p className="text-15 text-muted">
      No preview for {subjectLabel(item.subjectType)} items yet. Subject id{' '}
      <code className="text-14">{item.subjectId}</code>.
    </p>
  );
}

export default async function ReviewItemPage({ params }: { params: Params }) {
  const operator = await requireConsoleOperator();
  const { id } = await params;
  const db = getDb();
  const item = await getReviewItem(db, id);
  if (!item) notFound();

  const operators = await listOperators(db);
  const signOffCents = await getSetting(db, 'ops.second_signoff_refund_cents');
  const thresholds = await getSetting(db, 'trust.thresholds');
  const history = await searchAudit(db, {
    subjectType: 'review_item',
    subjectId: item.id,
    limit: 30,
  });
  const now = new Date();
  const me = operator.user.id;
  const names = new Map(operators.map((o) => [o.userId, o.name]));
  const pending = item.actions.find((a) => a.status === 'pending_second');
  const resolved = item.status === 'resolved';
  const mayAct = operator.role === 'owner' || operator.queues.includes(item.queue);
  const heldByOther = item.assigneeId !== null && item.assigneeId !== me;
  const mayDecide = mayAct && !resolved && !pending && (!heldByOther || operator.role === 'owner');
  const coverage = operators.filter((o) => covers(o, item.queue));
  const checkThresholds =
    item.check && (item.check.kind === 'text_safety' || item.check.kind === 'image_safety')
      ? thresholds[item.check.kind]
      : null;

  return (
    <>
      <PageHeader
        back={{ href: `/queues?queue=${item.queue}`, label: `${QUEUE_LABEL[item.queue]} queue` }}
        title={`${subjectLabel(item.subjectType)} review`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <QueueBadge queue={item.queue} />
            <StatusBadge status={item.status} />
            {item.resolution ? (
              <Badge tone="neutral">{RESOLUTION_LABEL[item.resolution]}</Badge>
            ) : null}
            <span className="text-14 text-muted" title={item.id}>
              Item {shortId(item.id)}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel title="Subject" description={subjectLabel(item.subjectType)}>
            <SubjectPreview item={item} operator={operator} />
          </Panel>

          <Panel title="AI assessment">
            {item.check ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                    <Sparkles className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-15 text-ink">{item.check.reason}</p>
                    {item.check.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.check.labels.map((label) => (
                          <Badge key={label} tone="neutral">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Facts
                  items={[
                    {
                      label: 'Score',
                      value:
                        item.check.score === null ? (
                          'No answer (the check failed)'
                        ) : (
                          <span className="tabular-nums">
                            {formatScore(item.check.score)}
                            {checkThresholds ? (
                              <span className="text-14 text-muted">
                                {' '}
                                (approve below {formatScore(checkThresholds.approveBelow)}, reject
                                from {formatScore(checkThresholds.rejectAtOrAbove)})
                              </span>
                            ) : null}
                          </span>
                        ),
                    },
                    {
                      label: 'Check',
                      value: `${item.check.kind.replace(/_/g, ' ')} · ${item.check.promptVersion}`,
                    },
                    { label: 'Model', value: `${item.check.model} (${item.check.provider})` },
                    { label: 'Checked', value: formatDateTime(item.check.createdAt) },
                  ]}
                />
              </div>
            ) : (
              <p className="text-15 text-muted">
                No AI check: this item was opened by{' '}
                {item.originalItemId ? 'an appeal' : 'the system or a person'}.
              </p>
            )}
          </Panel>

          <Panel
            title="Decision"
            description={
              resolved
                ? undefined
                : pending
                  ? 'Waiting for a second sign-off.'
                  : 'Choose what happens to the subject.'
            }
          >
            {resolved ? (
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
                <p className="text-15 text-ink">
                  {item.resolution ? RESOLUTION_LABEL[item.resolution] : 'Resolved'} by{' '}
                  {item.decidedBy === me ? 'you' : (item.decidedByName ?? 'an operator')}
                  {item.resolvedAt ? ` on ${formatDateTime(item.resolvedAt)}` : ''}.
                </p>
              </div>
            ) : pending ? (
              <div className="flex flex-col gap-4">
                <p className="text-15 text-ink">
                  <span className="font-semibold">
                    {pending.actorId === me ? 'You' : pending.actorName}
                  </span>{' '}
                  chose <span className="font-semibold">{ACTION_LABEL[pending.action]}</span>
                  {pending.amountCents ? ` for ${formatCents(pending.amountCents)}` : ''}{' '}
                  <TimeAgo at={pending.createdAt} now={now} />.
                </p>
                <SecondSignOff actionId={pending.id} isAuthor={pending.actorId === me} />
              </div>
            ) : mayDecide ? (
              <DecisionPanel
                itemId={item.id}
                actions={actionsFor(item.subjectType, item.queue)}
                signOffCents={signOffCents}
              />
            ) : (
              <p className="text-15 text-muted">
                {mayAct
                  ? `${item.assigneeName ?? 'Another operator'} holds this item. Ask them to hand it off.`
                  : `You are not assigned to the ${QUEUE_LABEL[item.queue]} queue.`}
              </p>
            )}
          </Panel>

          <Panel title="Notes" description="Internal. Mention an operator to notify them.">
            <div className="flex flex-col gap-6">
              {item.notes.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No notes yet"
                  titleAs="h3"
                  className="py-4"
                />
              ) : (
                <ol className="flex flex-col gap-4">
                  {item.notes.map((note) => (
                    <li key={note.id} className="flex gap-3">
                      <Avatar name={note.authorName} size="sm" decorative />
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-13 text-muted">
                          <span className="font-semibold text-ink">
                            {note.authorId === me ? 'You' : note.authorName}
                          </span>{' '}
                          · <TimeAgo at={note.createdAt} now={now} />
                        </p>
                        <NoteBody body={note.body} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {mayAct && !resolved ? (
                <NoteForm
                  itemId={item.id}
                  operators={operators
                    .filter((o) => o.userId !== me)
                    .map((o) => ({ userId: o.userId, name: o.name }))}
                />
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Details">
            <div className="flex flex-col gap-5">
              <Facts
                columns={1}
                items={[
                  {
                    label: 'Assignee',
                    value: item.assigneeId ? (
                      <span className="flex items-center gap-2">
                        <Avatar name={item.assigneeName ?? 'Operator'} size="sm" decorative />
                        {item.assigneeId === me ? 'Assigned to you' : item.assigneeName}
                      </span>
                    ) : (
                      'Nobody yet'
                    ),
                  },
                  {
                    label: resolved ? 'Resolved' : 'Time limit',
                    value:
                      resolved && item.resolvedAt ? (
                        formatDateTime(item.resolvedAt)
                      ) : (
                        <DueLabel due={item.slaDueAt} resolved={false} now={now} />
                      ),
                  },
                  { label: 'Opened', value: formatDateTime(item.createdAt) },
                  {
                    label: 'Priority',
                    value: <span className="tabular-nums">{item.priority}</span>,
                  },
                  ...(item.escalatedTo
                    ? [{ label: 'Escalated to', value: item.escalatedToName ?? 'an operator' }]
                    : []),
                  ...(item.originalItemId
                    ? [
                        {
                          label: 'Appeal of',
                          value: (
                            <Link
                              href={`/queues/${item.originalItemId}`}
                              className="text-ink underline underline-offset-2"
                            >
                              Item {shortId(item.originalItemId)}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {!resolved && mayAct && item.status === 'open' ? (
                <ClaimButton itemId={item.id} />
              ) : null}
            </div>
          </Panel>

          {!resolved && mayAct ? (
            <>
              <Panel title="Escalate" headingLevel="h2">
                <EscalateForm
                  itemId={item.id}
                  candidates={coverage
                    .filter((o) => o.userId !== me)
                    .map((o) => ({ userId: o.userId, name: o.name, role: o.role }))}
                />
              </Panel>
              {item.assigneeId === me || operator.role === 'owner' ? (
                <Panel title="Hand off">
                  <HandOffForm
                    itemId={item.id}
                    candidates={coverage
                      .filter((o) => o.userId !== item.assigneeId)
                      .map((o) => ({
                        userId: o.userId,
                        name: o.userId === me ? `${o.name} (you)` : o.name,
                        role: o.role,
                      }))}
                  />
                </Panel>
              ) : null}
            </>
          ) : null}

          <Panel title="History" bodyClassName="p-0">
            {history.items.length === 0 ? (
              <p className="p-5 text-14 text-muted">Nothing recorded yet.</p>
            ) : (
              <ol>
                {history.items.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-col gap-0.5 border-b border-line px-5 py-3 last:border-b-0"
                  >
                    <code className="text-13 font-semibold text-ink">{event.action}</code>
                    <span className="text-13 text-muted">
                      {event.actorId
                        ? event.actorId === me
                          ? 'You'
                          : (names.get(event.actorId) ?? 'An operator')
                        : 'System'}{' '}
                      · <TimeAgo at={event.createdAt} now={now} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
