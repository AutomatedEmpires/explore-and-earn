'use client';

import { useState } from 'react';
import { Switch } from '@/ui/components';
import { setOperatorShift } from '../actions';
import { ActionMessage } from './ActionMessage';
import { useConsoleAction } from './use-console-action';

/** On shift / Away for one operator. New items are routed only to operators on shift. */
export function ShiftSwitch({
  userId,
  shiftStatus,
  label,
  disabled,
}: {
  userId: string;
  shiftStatus: 'on_shift' | 'away';
  label: string;
  disabled?: boolean;
}) {
  const { run, pending, result } = useConsoleAction(setOperatorShift);
  // Shown at once; put back if the change is refused.
  const [onShift, setOnShift] = useState(shiftStatus === 'on_shift');

  return (
    <div>
      <Switch
        label={label}
        description={onShift ? 'Receiving new items' : 'Away: no new items'}
        checked={onShift}
        disabled={disabled || pending}
        onCheckedChange={async (checked) => {
          setOnShift(checked);
          const outcome = await run(userId, checked ? 'on_shift' : 'away');
          if (!outcome.ok) setOnShift(!checked);
        }}
      />
      {result && !result.ok ? <ActionMessage result={result} /> : null}
    </div>
  );
}
