// Operators (spec section 12): everyone who works the console, the queues they cover, whether
// they are on shift, and their stats for the last 30 days. Owners invite new operators and
// assign queues.
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { listOperators, operatorStats } from '@/modules/operator';
import { QUEUES } from '@/modules/trust';
import { Avatar, Badge, StatTile } from '@/ui/components';
import { InviteForm, QueueAssignment } from '../_components/OperatorForms';
import { PageHeader, Panel } from '../_components/parts';
import { ShiftSwitch } from '../_components/ShiftSwitch';
import { formatMinutes, QUEUE_LABEL } from '../_lib/format';
import { requireConsoleOperator } from '../_lib/session';

export const metadata: Metadata = { title: 'Operators' };

const STATS_DAYS = 30;

export default async function OperatorsPage() {
  const operator = await requireConsoleOperator();
  const db = getDb();
  const now = new Date();
  const since = new Date(now.getTime() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const operators = await listOperators(db);
  const stats: Awaited<ReturnType<typeof operatorStats>>[] = [];
  for (const o of operators) stats.push(await operatorStats(db, o.userId, since));
  const isOwner = operator.role === 'owner';
  const queueOptions = QUEUES.map((q) => ({ value: q, label: QUEUE_LABEL[q] }));

  return (
    <>
      <PageHeader
        title="Operators"
        description={`Queues, shifts and the last ${STATS_DAYS} days of decisions.`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ul className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {operators.map((op, index) => {
            const s = stats[index];
            const self = op.userId === operator.user.id;
            return (
              <li key={op.userId}>
                <Panel>
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-4">
                      <Avatar name={op.name} size="lg" decorative />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h2 className="flex flex-wrap items-center gap-2 text-17 font-bold text-ink">
                          {op.name}
                          {self ? (
                            <span className="text-14 font-semibold text-muted">(you)</span>
                          ) : null}
                          <Badge size="sm" tone={op.role === 'owner' ? 'inverse' : 'neutral'}>
                            {op.role === 'owner' ? 'Owner' : 'Operator'}
                          </Badge>
                        </h2>
                        {op.email ? (
                          <p className="truncate text-14 text-muted">{op.email}</p>
                        ) : null}
                      </div>
                      <div className="w-full sm:w-auto">
                        <ShiftSwitch
                          userId={op.userId}
                          shiftStatus={op.shiftStatus}
                          label={self ? 'On shift' : `${op.name} on shift`}
                          disabled={!self && !isOwner}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <StatTile
                        label="In hand"
                        value={op.inHand}
                        className="shadow-none bg-surface-2"
                      />
                      <StatTile
                        label="Handled"
                        value={s?.handled ?? 0}
                        className="shadow-none bg-surface-2"
                      />
                      <StatTile
                        label="Average time"
                        value={
                          s?.avgHandleMinutes === null || s?.avgHandleMinutes === undefined
                            ? 'None'
                            : formatMinutes(s.avgHandleMinutes)
                        }
                        className="shadow-none bg-surface-2"
                      />
                      <StatTile
                        label="Overturned"
                        hint="on appeal"
                        value={s?.overturnedOnAppeal ?? 0}
                        className="shadow-none bg-surface-2"
                      />
                    </div>

                    {op.role === 'owner' ? (
                      <p className="text-14 text-muted">Owners cover every queue.</p>
                    ) : isOwner ? (
                      <QueueAssignment
                        userId={op.userId}
                        name={self ? 'you' : op.name}
                        queues={op.queues}
                        options={queueOptions}
                      />
                    ) : (
                      <p className="text-14 text-ink-2">
                        <span className="font-semibold text-ink">Queues: </span>
                        {op.queues.length > 0
                          ? op.queues.map((q) => QUEUE_LABEL[q]).join(', ')
                          : 'None assigned yet'}
                      </p>
                    )}
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>

        <div className="flex min-w-0 flex-col gap-6">
          {isOwner ? (
            <Panel
              title="Invite an operator"
              description="They get an email to create their account, then add a passkey."
            >
              <InviteForm />
            </Panel>
          ) : (
            <Panel title="Invitations">
              <p className="text-15 text-muted">Only an Owner can invite operators.</p>
            </Panel>
          )}
          <Panel title="How routing works" headingLevel="h2">
            <ul className="flex list-disc flex-col gap-2 pl-5 text-14 text-ink-2">
              <li>
                New items go to the on-shift operator covering the queue with the fewest items in
                hand.
              </li>
              <li>
                Overdue items move to someone else; if nobody can take one, the Owners are alerted.
              </li>
              <li>
                Appeals never go to the operator who made the original decision while someone else
                is available.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
