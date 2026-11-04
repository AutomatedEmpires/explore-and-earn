// Token classes only. Issue #123 in a comment is fine.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}$/;

export function Ok() {
  return (
    <a href="#main" className="text-ink bg-surface rounded-md px-4 py-2">
      Skip to content
    </a>
  );
}
