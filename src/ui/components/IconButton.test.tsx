// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { X } from '@/ui/icons';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('cannot be used without a label', () => {
    // @ts-expect-error an icon-only control needs a label for its aria-label
    const element = <IconButton icon={X} />;
    expect(element).toBeTruthy();
  });

  it('uses the label as its aria-label', () => {
    const onClick = vi.fn();
    render(<IconButton icon={X} label="Close" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('aria-label', 'Close');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a 44 px target by default and hides its icon from assistive tech', () => {
    render(<IconButton icon={X} label="Skip" />);
    const button = screen.getByRole('button', { name: 'Skip' });
    expect(button.className).toContain('size-11');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a count badge without changing the accessible name', () => {
    render(<IconButton icon={X} label="Inbox, 2 unread" badge={2} />);
    const button = screen.getByRole('button', { name: 'Inbox, 2 unread' });
    expect(button).toHaveTextContent('2');
  });
});
