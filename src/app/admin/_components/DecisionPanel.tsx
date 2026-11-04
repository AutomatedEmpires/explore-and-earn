'use client';

import { useState } from 'react';
import type { ReviewAction } from '@/modules/trust';
import { Button, Dialog, DialogClose, Input } from '@/ui/components';
import { decideItem } from '../actions';
import { ACTION_HINT, ACTION_LABEL, formatCents } from '../_lib/format';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

/** Decisions that change or take away something, so they are confirmed first. */
const CONFIRM: readonly ReviewAction[] = ['remove', 'suspend', 'ban', 'refund'];

const CONFIRM_TITLE: Partial<Record<ReviewAction, string>> = {
  remove: 'Remove this content?',
  suspend: 'Suspend this account?',
  ban: 'Ban this account?',
  refund: 'Refund this payment?',
};

/** Parses "12.50" (dollars) into 1250 cents, or null. */
function toCents(dollars: string): number | null {
  const value = dollars.trim().replace(/[$,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 ? cents : null;
}

/** The decision buttons for an open item (Approve, Remove, Ask for info, Suspend, Ban, Refund). */
export function DecisionPanel({
  itemId,
  actions,
  signOffCents,
}: {
  itemId: string;
  actions: readonly ReviewAction[];
  /** Refunds above this need a second operator (once there are two). */
  signOffCents: number;
}) {
  const { run, pending, result } = useConsoleAction(decideItem);
  const [confirming, setConfirming] = useState<ReviewAction | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const cents = toCents(amount);

  async function apply(action: ReviewAction) {
    setConfirming(null);
    await run(itemId, action === 'refund' && cents ? { action, amountCents: cents } : { action });
  }

  function choose(action: ReviewAction) {
    if (action === 'refund' && cents === null) {
      setAmountError('Enter the amount to refund, for example 25.00');
      return;
    }
    setAmountError(null);
    if (CONFIRM.includes(action)) setConfirming(action);
    else void apply(action);
  }

  const buttons = actions.filter((a) => a !== 'refund');
  const canRefund = actions.includes('refund');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {buttons.map((action) => (
          <Button
            key={action}
            variant={action === 'approve' ? 'primary' : action === 'ban' ? 'danger' : 'secondary'}
            disabled={pending}
            onClick={() => choose(action)}
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>

      {canRefund ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
            label="Refund amount (USD)"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={amountError ?? undefined}
            hint={`Over ${formatCents(signOffCents)} needs a second operator.`}
            fieldClassName="sm:w-64"
          />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => choose('refund')}
            className="sm:mt-7"
          >
            {ACTION_LABEL.refund}
          </Button>
        </div>
      ) : null}

      <p className="text-13 text-muted">
        A ban, or a refund over {formatCents(signOffCents)}, waits for a second operator once the
        console has two or more.
      </p>
      <ActionMessage result={result} />

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={confirming ? CONFIRM_TITLE[confirming] : ''}
        description={
          confirming
            ? `${ACTION_HINT[confirming]}${confirming === 'refund' && cents ? ` Amount: ${formatCents(cents)}.` : ''}`
            : undefined
        }
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant={confirming === 'ban' ? 'danger' : 'primary'}
              onClick={() => confirming && void apply(confirming)}
            >
              {confirming ? ACTION_LABEL[confirming] : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
