/**
 * The in-repo brand mark, drawn in currentColor.
 *
 * Spec D9: the demo organisation's "logo" is this mark and nothing else. No
 * invented brand, no remote asset, no stock photograph. It is the same pin
 * silhouette the global header carries, redrawn here so the demo surfaces do
 * not have to import chrome that owns its own layout.
 */
export function DemoBrandMark({ size = 28 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 42) / 36)}
      viewBox="0 0 36 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 1.5C9.99 1.5 3.5 8 3.5 16c0 5.36 2.88 10.06 7.16 12.7L18 40.5l7.34-11.8C29.62 26.06 32.5 21.36 32.5 16 32.5 8 26.01 1.5 18 1.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <line
        x1="8"
        y1="21"
        x2="28"
        y2="21"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M8.5 21L13.5 13l4 5 3.5-6.5L28 21"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />
      <path
        d="M15 12.5a3 3 0 0 1 6 0"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.48"
      />
    </svg>
  );
}
