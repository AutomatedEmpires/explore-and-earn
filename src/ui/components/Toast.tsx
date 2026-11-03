'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/ui/cn';
import { CircleAlert, CircleCheck, X } from '@/ui/icons';
import { IconButton } from './IconButton';

export type ToastTone = 'default' | 'success' | 'danger';

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** For example Undo after a skip; the toast closes once the action runs. */
  action?: { label: string; onAction: () => void };
  /** Default 5 s, or 10 s when there is an action. Paused while hovered or focused. */
  durationMs?: number;
};

export type ToastProps = Omit<ToastOptions, 'durationMs'> & {
  onDismiss?: () => void;
  className?: string;
};

const toneIcon = { success: CircleCheck, danger: CircleAlert } as const;

/** The toast itself; use ToastProvider and useToast to show one. */
export function Toast({
  title,
  description,
  tone = 'default',
  action,
  onDismiss,
  className,
}: ToastProps) {
  const Icon = tone === 'default' ? null : toneIcon[tone];
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg bg-primary py-2 pr-2 pl-4 text-on-primary shadow-overlay',
        'motion-safe:animate-pop-in',
        className,
      )}
    >
      {Icon ? <Icon className="size-5 shrink-0" /> : null}
      <div className="min-w-0 flex-1 py-1">
        <p className="text-15 font-semibold">{title}</p>
        {description ? <p className="text-13 opacity-90">{description}</p> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss?.();
          }}
          className="min-h-11 shrink-0 rounded-full px-3 text-15 font-bold text-on-primary underline-offset-2 hover:underline"
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <IconButton
          icon={X}
          label="Dismiss"
          variant="primary"
          className="shrink-0 hover:bg-transparent hover:opacity-80"
          onClick={onDismiss}
        />
      ) : null}
    </div>
  );
}

type ToastEntry = ToastOptions & { id: string };

type ToastApi = { toast: (options: ToastOptions) => string; dismiss: (id: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Hosts the polite live region that every toast is announced from. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setEntries((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    // Newest last; keep at most three on screen.
    setEntries((list) => [...list, { ...options, id }].slice(-3));
    return id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:items-end md:pr-6"
      >
        {entries.map((entry) => (
          <TimedToast key={entry.id} entry={entry} onDismiss={() => dismiss(entry.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function TimedToast({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const duration = entry.durationMs ?? (entry.action ? 10_000 : 5_000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused]);

  return (
    <div
      className="pointer-events-auto w-full max-w-sm"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast {...entry} onDismiss={onDismiss} />
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
