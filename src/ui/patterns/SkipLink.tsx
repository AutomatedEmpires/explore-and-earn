/** The first stop for keyboard users: jumps past the navigation to `#main`. */
export function SkipLink({ href = '#main' }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-surface focus:px-4 focus:text-15 focus:font-bold focus:text-ink focus:shadow-overlay"
    >
      Skip to content
    </a>
  );
}
