'use client';

// BlockDialog: confirms a block, with the optional "Also withdraw my applications to this host"
// for a seeker blocking a host (SP4 spec 7 and 8.7; plan Task 34).
//
// Design: the approved visa check confirmation (Figma 02 Seeker "Apply · visa check"
// 180:17637): a title, the plain consequence, one primary action and a secondary way back, in
// the system Dialog (00 System 18:1793), with the system Checkbox. Lead's designops rule 7
// answer on #145.
//
// What the copy promises matches PR 205's routes and nothing more:
// - a seeker blocking a host: PUT /me/blocks. The host isn't told. Open applications are
//   withdrawn only when the box is ticked.
// - a host blocking an applicant: PUT /host/blocks by application id. The applicant isn't told;
//   their side of the conversation reads as closed, never "blocked".
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ALSO_WITHDRAW } from '@/lib/safety';
import { Button, Checkbox, Dialog, DialogClose, Notice } from '@/ui/components';
import { apiFetch, ApiError } from '../api';
import {
  BLOCK_APPLICATION_UNAVAILABLE,
  BLOCK_CANCEL,
  BLOCK_CONFIRM,
  BLOCK_ROLE_NOT_ALLOWED,
  blockFailed,
  blockTitle,
  hostBlocksSeeker,
  seekerBlocksOrg,
  seekerBlocksUser,
  WITHDRAW_HINT,
} from './copy';

export type BlockDialogProps =
  | {
      by: 'seeker';
      target: { type: 'org' | 'user'; id: string; name: string };
      offerWithdraw: boolean;
      open: boolean;
      onOpenChange(open: boolean): void;
      onBlocked?(): void;
    }
  | {
      by: 'host';
      applicationId: string;
      firstName: string;
      open: boolean;
      onOpenChange(open: boolean): void;
      onBlocked?(): void;
    };

function failureOf(err: unknown, props: BlockDialogProps, name: string): string {
  if (props.by === 'host' && err instanceof ApiError) {
    if (err.status === 403 && err.reason === 'role_not_allowed') return BLOCK_ROLE_NOT_ALLOWED;
    if (err.status === 404) return BLOCK_APPLICATION_UNAVAILABLE;
  }
  return blockFailed(name);
}

/**
 * Focus goes back to whatever opened the dialog. The system Dialog has no trigger here (the
 * caller owns `open`), and without one Radix would leave focus on <body>.
 * - The opener is read in a layout effect when `open` turns true: Radix's portal mounts the
 *   content one render later, so focus hasn't moved into the dialog yet.
 * - It is focused again in a passive effect when `open` turns false. React runs every passive
 *   cleanup first, so Radix's focus trap is already off and can't pull focus back in.
 */
function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  useEffect(() => {
    if (open) return;
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
  }, [open]);
}

export function BlockDialog(props: BlockDialogProps): ReactNode {
  const { open, onOpenChange, onBlocked } = props;
  const name = props.by === 'seeker' ? props.target.name : props.firstName;
  const offerWithdraw = props.by === 'seeker' && props.offerWithdraw && props.target.type === 'org';
  const [withdraw, setWithdraw] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useReturnFocus(open);

  function change(next: boolean) {
    if (!next) {
      setWithdraw(false);
      setFailure(null);
    }
    onOpenChange(next);
  }

  async function confirm() {
    setSending(true);
    setFailure(null);
    try {
      if (props.by === 'seeker') {
        await apiFetch('/api/v1/me/blocks', {
          method: 'PUT',
          json: {
            targetType: props.target.type,
            targetId: props.target.id,
            ...(offerWithdraw ? { withdrawApplications: withdraw } : {}),
          },
        });
      } else {
        await apiFetch('/api/v1/host/blocks', {
          method: 'PUT',
          json: { applicationId: props.applicationId },
        });
      }
      onBlocked?.();
      change(false);
    } catch (err) {
      setFailure(failureOf(err, props, name));
    } finally {
      setSending(false);
    }
  }

  const body =
    props.by === 'host'
      ? hostBlocksSeeker(props.firstName)
      : props.target.type === 'org'
        ? seekerBlocksOrg(props.target.name)
        : seekerBlocksUser(props.target.name);

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={blockTitle(name)}
      description={body}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">{BLOCK_CANCEL}</Button>
          </DialogClose>
          <Button loading={sending} onClick={() => void confirm()}>
            {BLOCK_CONFIRM}
          </Button>
        </>
      }
    >
      {failure || offerWithdraw ? (
        <div className="flex flex-col gap-3">
          {failure ? <Notice tone="danger" title={failure} announce="assertive" /> : null}
          {offerWithdraw ? (
            <Checkbox
              label={ALSO_WITHDRAW}
              description={WITHDRAW_HINT}
              checked={withdraw}
              onChange={(event) => setWithdraw(event.target.checked)}
            />
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
