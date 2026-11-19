// @vitest-environment jsdom
// BlockDialog (SP4 plan Task 34): the seeker and host modes, the routes they call, copy that is
// true to PR 205 (the other side is never told), and focus going back to the opener.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ALSO_WITHDRAW } from '@/lib/safety';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';
import { seriousOrCritical } from './axe-test-helper';
import { BlockDialog, type BlockDialogProps } from './BlockDialog';

setupMswServer();

// The Checkbox label wraps its hint, so the accessible name starts with the label.
const WITHDRAW_NAME = new RegExp(`^${ALSO_WITHDRAW}`);
const ORG_ID = '019a4a3c-0000-7000-8000-0000000d0003';
const APPLICATION_ID = '019a4a3c-0000-7000-8000-00000000b001';

/** Omit over each member of the props union, so a mode keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Mode = DistributiveOmit<BlockDialogProps, 'open' | 'onOpenChange' | 'onBlocked'>;

/** A page with an opener button, the way a host page or thread mounts the dialog. */
function Harness({ mode, onBlocked }: { mode: Mode; onBlocked?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        More
      </button>
      <BlockDialog
        {...(mode as BlockDialogProps)}
        open={open}
        onOpenChange={setOpen}
        onBlocked={onBlocked}
      />
    </>
  );
}

function open() {
  const opener = screen.getByRole('button', { name: 'More' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

function capture(path: string) {
  const bodies: unknown[] = [];
  server.use(
    http.put(apiUrl(path), async ({ request }) => {
      bodies.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return bodies;
}

const seekerOrg = {
  by: 'seeker',
  target: { type: 'org', id: ORG_ID, name: 'Kettle Ridge Lodge' },
  offerWithdraw: true,
} satisfies Mode;

describe('BlockDialog, seeker mode', () => {
  it('names the host, says what changes and that the host is not told', async () => {
    render(<Harness mode={seekerOrg} />);
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Block Kettle Ridge Lodge?' });
    expect(dialog).toHaveTextContent("You won't see Kettle Ridge Lodge's jobs.");
    expect(dialog).toHaveTextContent("Kettle Ridge Lodge isn't told.");
    expect(within(dialog).getByRole('checkbox', { name: WITHDRAW_NAME })).not.toBeChecked();
  });

  it('with the box ticked, blocks and withdraws, then calls onBlocked and closes', async () => {
    const bodies = capture('/api/v1/me/blocks');
    const onBlocked = vi.fn();
    render(<Harness mode={seekerOrg} onBlocked={onBlocked} />);
    const opener = open();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: WITHDRAW_NAME }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ targetType: 'org', targetId: ORG_ID, withdrawApplications: true }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('without the box ticked, leaves the applications open', async () => {
    const bodies = capture('/api/v1/me/blocks');
    render(<Harness mode={seekerOrg} />);
    open();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Block' }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ targetType: 'org', targetId: ORG_ID, withdrawApplications: false });
  });

  it('offers no withdraw box when the caller says there is nothing to withdraw', async () => {
    render(<Harness mode={{ ...seekerOrg, offerWithdraw: false }} />);
    open();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('blocks a person without any withdraw field', async () => {
    const bodies = capture('/api/v1/me/blocks');
    const person: Mode = {
      by: 'seeker',
      target: { type: 'user', id: ORG_ID, name: 'Sam Ortiz' },
      offerWithdraw: true,
    };
    render(<Harness mode={person} />);
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Block Sam Ortiz?' });
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(bodies).toEqual([{ targetType: 'user', targetId: ORG_ID }]));
  });

  it('keeps the dialog open with a message when the block fails', async () => {
    server.use(
      http.put(apiUrl('/api/v1/me/blocks'), () =>
        HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 }),
      ),
    );
    const onBlocked = vi.fn();
    render(<Harness mode={seekerOrg} onBlocked={onBlocked} />);
    open();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't block Kettle Ridge Lodge. Try again.",
    );
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('returns focus to the opener on Cancel', async () => {
    render(<Harness mode={seekerOrg} />);
    const opener = open();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});

describe('BlockDialog, host mode', () => {
  const host: Mode = { by: 'host', applicationId: APPLICATION_ID, firstName: 'Maya' };

  it('blocks the applicant by application id', async () => {
    const bodies = capture('/api/v1/host/blocks');
    const onBlocked = vi.fn();
    render(<Harness mode={host} onBlocked={onBlocked} />);
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Block Maya?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ applicationId: APPLICATION_ID }]);
  });

  it('never says the applicant is told or notified', async () => {
    render(<Harness mode={host} />);
    open();
    const dialog = await screen.findByRole('dialog');
    const text = dialog.textContent ?? '';
    expect(text).not.toMatch(/blocked you/i);
    expect(text).not.toMatch(/notif/i);
    expect(text).toContain("Maya isn't told.");
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('explains a billing member refusal without guessing at anything else', async () => {
    server.use(
      http.put(apiUrl('/api/v1/host/blocks'), () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'No', details: { reason: 'role_not_allowed' } } },
          { status: 403 },
        ),
      ),
    );
    render(<Harness mode={host} />);
    open();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Only owners, admins and recruiters can block applicants.',
    );
  });
});

describe('BlockDialog accessibility', () => {
  it.each([
    ['seeker blocking a host', seekerOrg],
    [
      'host blocking an applicant',
      { by: 'host', applicationId: APPLICATION_ID, firstName: 'Maya' } as Mode,
    ],
  ])('has no serious or critical axe violations: %s', async (_name, mode) => {
    render(<Harness mode={mode} />);
    open();
    await screen.findByRole('dialog');
    expect(await seriousOrCritical(document.body)).toEqual([]);
  });

  it('gives Cancel and Block 44 px targets', async () => {
    render(<Harness mode={seekerOrg} />);
    open();
    const dialog = await screen.findByRole('dialog');
    for (const name of ['Cancel', 'Block']) {
      expect(within(dialog).getByRole('button', { name })).toHaveClass('h-11');
    }
  });
});
