'use client';

import { useState } from 'react';
import { Button, Pill, Textarea } from '@/ui/components';
import { addItemNote } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

type Mentionable = { userId: string; name: string };

/** `@[Name](id)`, with the characters that would break the token removed from the name. */
function mentionToken(op: Mentionable): string {
  const name =
    op.name
      .replace(/[[\]\r\n]/g, ' ')
      .trim()
      .slice(0, 100) || 'Operator';
  return `@[${name}](${op.userId})`;
}

/**
 * An internal note. Choosing operators under the box mentions them: the note starts with their
 * @mentions, and each is notified.
 */
export function NoteForm({ itemId, operators }: { itemId: string; operators: Mentionable[] }) {
  const { run, pending, result } = useConsoleAction(addItemNote);
  const [body, setBody] = useState('');
  const [mentioned, setMentioned] = useState<string[]>([]);

  async function submit() {
    const mentions = operators.filter((o) => mentioned.includes(o.userId)).map(mentionToken);
    const text = [...mentions, body.trim()].filter(Boolean).join(' ');
    const outcome = await run(itemId, text);
    if (outcome.ok) {
      setBody('');
      setMentioned([]);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Textarea
        label="Note"
        hint="Internal: only operators see notes."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4800}
        rows={3}
      />
      {operators.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-14 font-semibold text-ink">Mention</legend>
          <div className="flex flex-wrap gap-2">
            {operators.map((op) => {
              const selected = mentioned.includes(op.userId);
              return (
                <Pill
                  key={op.userId}
                  selected={selected}
                  onClick={() =>
                    setMentioned((list) =>
                      selected ? list.filter((id) => id !== op.userId) : [...list, op.userId],
                    )
                  }
                >
                  @{op.name}
                </Pill>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" loading={pending} disabled={!body.trim()}>
          Add note
        </Button>
        <ActionMessage result={result} />
      </div>
    </form>
  );
}
