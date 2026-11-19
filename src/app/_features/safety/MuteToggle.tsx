'use client';

// MuteToggle: mutes or unmutes a host for the seeker (SP4 spec 8.7; plan Task 34). PUT and
// DELETE /me/mutes/:orgId. A muted host can't invite the seeker, and muting also unfollows it;
// the host's jobs stay visible and open to apply (only a block hides them).
//
// Design: the approved Switch rows on the Profile hub (Figma 03 Hiring 68:27601, "Visible to
// hosts" with its description), the system Switch (00 System 16:1773). Lead's designops rule 7
// answer on #145. The switch moves at once and goes back if the change fails; it stays
// focusable while the call runs, so keyboard focus is never dropped.
import { useRef, useState, type ReactNode } from 'react';
import { Switch } from '@/ui/components';
import { CircleAlert } from '@/ui/icons';
import { apiFetch } from '../api';
import { MUTE_FAILED, muteDescription, muteLabel } from './copy';

export type MuteToggleProps = {
  orgId: string;
  orgName: string;
  muted: boolean;
  onChange?(muted: boolean): void;
};

export function MuteToggle({ orgId, orgName, muted, onChange }: MuteToggleProps): ReactNode {
  const [value, setValue] = useState(muted);
  const [shownFor, setShownFor] = useState(muted);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);

  // A new `muted` from the caller wins (React's "adjust state when a prop changes").
  if (shownFor !== muted) {
    setShownFor(muted);
    setValue(muted);
  }

  async function toggle(next: boolean) {
    if (pending.current) return;
    pending.current = true;
    setValue(next);
    setFailed(false);
    try {
      await apiFetch(`/api/v1/me/mutes/${encodeURIComponent(orgId)}`, {
        method: next ? 'PUT' : 'DELETE',
      });
      onChange?.(next);
    } catch {
      setValue(!next);
      setFailed(true);
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="flex flex-col">
      <Switch
        label={muteLabel(orgName)}
        description={muteDescription(orgName)}
        checked={value}
        onCheckedChange={(checked) => void toggle(checked)}
      />
      {failed ? (
        <p role="alert" className="flex items-start gap-1.5 text-13 font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{MUTE_FAILED}</span>
        </p>
      ) : null}
    </div>
  );
}
