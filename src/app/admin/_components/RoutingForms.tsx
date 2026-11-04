'use client';

import { useState } from 'react';
import { Button, Select, Textarea } from '@/ui/components';
import { escalateItem, handOffItem } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

type Candidate = { userId: string; name: string; role: 'owner' | 'operator' };

const LEAST_LOADED_OWNER = 'owner';

/** Escalate to a named operator, or to the Owner with the fewest open items, with a reason. */
export function EscalateForm({ itemId, candidates }: { itemId: string; candidates: Candidate[] }) {
  const { run, pending, result } = useConsoleAction(escalateItem);
  const [to, setTo] = useState<string>(LEAST_LOADED_OWNER);
  const [reason, setReason] = useState('');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const outcome = await run(itemId, {
          reason,
          ...(to === LEAST_LOADED_OWNER ? {} : { toOperatorId: to }),
        });
        if (outcome.ok) setReason('');
      }}
    >
      <Select
        label="Escalate to"
        options={[
          { value: LEAST_LOADED_OWNER, label: 'An Owner (fewest items)' },
          ...candidates.map((c) => ({
            value: c.userId,
            label: c.role === 'owner' ? `${c.name} (Owner)` : c.name,
          })),
        ]}
        value={to}
        onValueChange={setTo}
      />
      <Textarea
        label="Reason"
        hint="Escalated items move to the top of the queue."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={2000}
        rows={2}
      />
      <div>
        <Button type="submit" variant="secondary" loading={pending} disabled={!reason.trim()}>
          Escalate
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}

/** Reassigns the item to another operator who covers its queue. */
export function HandOffForm({ itemId, candidates }: { itemId: string; candidates: Candidate[] }) {
  const { run, pending, result } = useConsoleAction(handOffItem);
  const [to, setTo] = useState<string | undefined>(undefined);

  if (candidates.length === 0) {
    return <p className="text-14 text-muted">Nobody else covers this queue yet.</p>;
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (to) await run(itemId, to);
      }}
    >
      <Select
        label="Hand off to"
        placeholder="Choose an operator"
        options={candidates.map((c) => ({ value: c.userId, label: c.name }))}
        value={to}
        onValueChange={setTo}
      />
      <div>
        <Button type="submit" variant="secondary" loading={pending} disabled={!to}>
          Hand off
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}
