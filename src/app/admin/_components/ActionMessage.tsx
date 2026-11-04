import Link from 'next/link';
import { cn } from '@/ui/cn';
import { CircleAlert, CircleCheck } from '@/ui/icons';
import type { ActionResult } from '../actions';

/** The outcome of a console action: announced politely when it worked, as an alert when not. */
export function ActionMessage({
  result,
  className,
}: {
  result: ActionResult | null;
  className?: string;
}) {
  return (
    <div aria-live="polite" className={cn(result ? 'mt-3' : undefined, className)}>
      {result && !result.ok ? (
        <p role="alert" className="flex items-start gap-1.5 text-14 font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{result.error}</span>
        </p>
      ) : null}
      {result?.ok && result.message ? (
        <p className="flex items-start gap-1.5 text-14 font-semibold text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            {result.message}
            {result.href ? (
              <>
                {' '}
                <Link href={result.href} className="text-ink underline underline-offset-2">
                  Open it
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}
