'use client';

// BuilderStepHeader (Figma 00 System 155:5144; #152 H-4, H-17): Back, one 14 px line
// "Step N of 10 · Saved 6:14 PM", Save and exit, and a progress bar at N/10.
import { Button, IconButton } from '@/ui/components';
import { ArrowLeft } from '@/ui/icons';

export function BuilderStepHeader({
  step,
  total,
  status,
  onBack,
  onExit,
  exiting = false,
}: {
  step: number;
  total: number;
  /** "Saved 6:14 PM", "Saving…", "Not saved: offline". */
  status: string;
  onBack: (() => void) | null;
  onExit: () => void;
  exiting?: boolean;
}) {
  const percent = Math.round((step / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        {onBack ? (
          <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
        <p className="min-w-0 flex-1 text-14 text-muted" aria-live="polite">
          Step {step} of {total} · {status}
        </p>
        <Button variant="ghost" className="pr-1 pl-3" loading={exiting} onClick={onExit}>
          Save and exit
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label="Listing progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${total}`}
        className="h-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
