'use client';

import { Button } from '@/ui/components';
import { Plus } from '@/ui/icons';
import { claimItem, createTestReviewItem } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

/** Takes an unassigned item. */
export function ClaimButton({
  itemId,
  variant = 'primary',
  describedBy,
}: {
  itemId: string;
  variant?: 'primary' | 'secondary';
  describedBy?: string;
}) {
  const { run, pending, result } = useConsoleAction(claimItem);
  return (
    <div className="flex flex-col items-start">
      <Button
        variant={variant}
        loading={pending}
        onClick={() => void run(itemId)}
        aria-describedby={describedBy}
      >
        Claim
      </Button>
      {result && !result.ok ? <ActionMessage result={result} /> : null}
    </div>
  );
}

/** Dev and preview only: a flagged text item through the real text check. */
export function CreateTestItemButton() {
  const { run, pending, result } = useConsoleAction(createTestReviewItem);
  return (
    <div className="flex flex-col items-start md:items-end">
      <Button variant="secondary" icon={Plus} loading={pending} onClick={() => void run()}>
        Create test item
      </Button>
      <ActionMessage result={result} />
    </div>
  );
}
