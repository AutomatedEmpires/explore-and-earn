'use client';

import { useState } from 'react';
import { Button, Checkbox, Input, Select } from '@/ui/components';
import { inviteConsoleOperator, setQueuesForOperator } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

type QueueOption = { value: string; label: string };

/** The queues one operator covers, as checkboxes (Owner only). */
export function QueueAssignment({
  userId,
  name,
  queues,
  options,
}: {
  userId: string;
  name: string;
  queues: string[];
  options: readonly QueueOption[];
}) {
  const { run, pending, result } = useConsoleAction(setQueuesForOperator);
  const [selected, setSelected] = useState<string[]>(queues);
  const changed = selected.length !== queues.length || selected.some((q) => !queues.includes(q));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(userId, selected);
      }}
    >
      <fieldset>
        <legend className="mb-1 text-14 font-semibold text-ink">Queues {name} covers</legend>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {options.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              checked={selected.includes(option.value)}
              onChange={(e) =>
                setSelected((list) =>
                  e.target.checked
                    ? [...list, option.value]
                    : list.filter((q) => q !== option.value),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <div className="mt-2">
        <Button type="submit" variant="secondary" loading={pending} disabled={!changed}>
          Save queues
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}

/** Owner only: emails a Clerk invitation that makes the new user an operator. */
export function InviteForm() {
  const { run, pending, result } = useConsoleAction(inviteConsoleOperator);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'operator' | 'owner'>('operator');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const outcome = await run({ email, role });
        if (outcome.ok) setEmail('');
      }}
    >
      <Input
        label="Email"
        type="email"
        autoComplete="off"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Select
        label="Role"
        options={[
          { value: 'operator', label: 'Operator' },
          { value: 'owner', label: 'Owner' },
        ]}
        hint={
          role === 'owner'
            ? 'Covers every queue and manages operators and settings.'
            : 'Works the queues an Owner assigns to them.'
        }
        value={role}
        onValueChange={setRole}
      />
      <div>
        <Button type="submit" loading={pending} disabled={!email.trim()}>
          Send invitation
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}
