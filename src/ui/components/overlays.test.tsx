// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BedDouble } from '@/ui/icons';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Sheet } from './Sheet';
import { ToastProvider, useToast } from './Toast';

describe('Sheet', () => {
  it('is a dialog named by its title with a labelled close button', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet
        open
        onOpenChange={onOpenChange}
        title="Housing"
        description="Lodge Housekeeper · Kettle Ridge Lodge"
        icon={BedDouble}
      >
        <p>Shared staff cabin</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Housing' });
    expect(dialog).toHaveTextContent('Shared staff cabin');
    expect(dialog).toHaveAccessibleDescription('Lodge Housekeeper · Kettle Ridge Lodge');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('is a bottom sheet on small screens and a side panel from md up', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Filters">
        <p>Body</p>
      </Sheet>,
    );
    const className = screen.getByRole('dialog').className;
    expect(className).toContain('bottom-0');
    expect(className).toContain('md:right-0');
  });
});

describe('Dialog', () => {
  it('is a dialog named by its title', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="Remove listing?" footer={<Button>Remove</Button>}>
        <p>This cannot be undone.</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Remove listing?' })).toHaveTextContent(
      'This cannot be undone.',
    );
  });
});

function SkipButton({ onUndo }: { onUndo: () => void }) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() =>
        toast({
          title: 'Job skipped',
          action: { label: 'Undo', onAction: onUndo },
          durationMs: 10_000,
        })
      }
    >
      Skip
    </Button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces politely and runs the undo action once', () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <SkipButton onUndo={onUndo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Job skipped');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Job skipped')).toBeNull();
  });

  it('dismisses itself after its duration', () => {
    render(
      <ToastProvider>
        <SkipButton onUndo={() => {}} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(screen.getByText('Job skipped')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText('Job skipped')).toBeNull();
  });
});
