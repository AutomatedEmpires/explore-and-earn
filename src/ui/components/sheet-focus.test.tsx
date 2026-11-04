// @vitest-environment jsdom
// A card's chips open one controlled Sheet (no Radix Trigger). Closing it must still return
// focus to the chip that opened it, as a Trigger-opened sheet does.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Sheet } from './Sheet';

function ControlledSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Housing Provided
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Housing">
        <p>Shared staff cabin</p>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('returns focus to the control that opened it when it has no trigger', async () => {
    render(<ControlledSheet />);
    const opener = screen.getByRole('button', { name: 'Housing Provided' });
    opener.focus();
    fireEvent.click(opener);
    const sheet = await screen.findByRole('dialog', { name: 'Housing' });
    await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
