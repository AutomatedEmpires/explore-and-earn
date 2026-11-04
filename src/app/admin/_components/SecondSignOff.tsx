'use client';

import { Button } from '@/ui/components';
import { approveSecondSignOff, rejectSecondSignOff } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

/**
 * A ban or large refund waiting for a second operator. Anyone but its author may approve it
 * (which applies it) or turn it down; the author may withdraw it.
 */
export function SecondSignOff({ actionId, isAuthor }: { actionId: string; isAuthor: boolean }) {
  const approve = useConsoleAction(approveSecondSignOff);
  const reject = useConsoleAction(rejectSecondSignOff);
  const pending = approve.pending || reject.pending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {isAuthor ? null : (
          <Button
            loading={approve.pending}
            disabled={pending}
            onClick={() => void approve.run(actionId)}
          >
            Approve
          </Button>
        )}
        <Button
          variant="secondary"
          loading={reject.pending}
          disabled={pending}
          onClick={() => void reject.run(actionId)}
        >
          {isAuthor ? 'Withdraw' : 'Turn down'}
        </Button>
      </div>
      {isAuthor ? (
        <p className="text-14 text-muted">A different operator has to approve your decision.</p>
      ) : null}
      <ActionMessage result={approve.result ?? reject.result} />
    </div>
  );
}
