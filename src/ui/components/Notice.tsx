import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type IconComponent } from '@/ui/icons';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export type NoticeProps = {
  tone?: NoticeTone;
  title: ReactNode;
  /** One or two sentences under the title. */
  children?: ReactNode;
  /** A Button, usually the one way to fix it. */
  action?: ReactNode;
  /** Replaces the tone's icon. The icon and the title carry the meaning, never the color. */
  icon?: IconComponent;
  /**
   * `polite` (role="status") for something that just happened, `assertive` (role="alert") for
   * a failure the host must act on now, `none` for a notice shown with the page.
   */
  announce?: 'polite' | 'assertive' | 'none';
  titleAs?: 'p' | 'h2' | 'h3';
  className?: string;
};

const TONES: Record<NoticeTone, { box: string; icon: string; Icon: IconComponent }> = {
  info: { box: 'bg-surface-2', icon: 'text-ink-2', Icon: Info },
  warning: { box: 'bg-warning-bg', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'bg-danger-bg', icon: 'text-danger', Icon: CircleAlert },
  success: { box: 'bg-success-bg', icon: 'text-success', Icon: CircleCheck },
};

/**
 * A message inside a page (Figma 00 System, Notice 144:4507): partial data, a warning to read
 * before going on, a failed save or upload, or a confirmation. A whole-page failure is an
 * ErrorState instead.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  icon,
  announce = 'none',
  titleAs: Title = 'p',
  className,
}: NoticeProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  const role = announce === 'assertive' ? 'alert' : announce === 'polite' ? 'status' : undefined;
  return (
    <div role={role} className={cn('flex gap-3 rounded-lg p-4 text-ink', t.box, className)}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', t.icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Title className="text-16 font-bold text-ink">{title}</Title>
        {children ? <div className="text-16 text-ink">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
