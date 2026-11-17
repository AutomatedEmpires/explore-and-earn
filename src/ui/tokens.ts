// Design tokens (spec section 10). The values here and in tokens.css must stay identical;
// tokens.test.ts checks both, and checks every text/background pair for WCAG contrast.
//
// Light values come from the Direction B design board. Category fg, bg and solid are the
// approved palette (issue 86). Dark values are derived so every pair in `tokenPairs` passes.

export const themes = ['light', 'dark'] as const;
export type Theme = (typeof themes)[number];

export const categories = ['maritime', 'seasonal', 'farm', 'remote'] as const;
export type Category = (typeof categories)[number];

export const colorTokenNames = [
  'bg',
  'surface',
  'surface-2',
  'ink',
  'ink-2',
  'muted',
  'line',
  'line-strong',
  'primary',
  'on-primary',
  'success',
  'success-bg',
  'warning',
  'warning-bg',
  'danger',
  'danger-bg',
  'focus',
  'maritime-fg',
  'maritime-bg',
  'maritime-solid',
  'seasonal-fg',
  'seasonal-bg',
  'seasonal-solid',
  'farm-fg',
  'farm-bg',
  'farm-solid',
  'remote-fg',
  'remote-bg',
  'remote-solid',
] as const;
export type ColorToken = (typeof colorTokenNames)[number];

/**
 * Roles:
 * - `bg` page, `surface` cards and bars, `surface-2` quiet fills (pills, icon tiles).
 * - `ink` primary text, `ink-2` secondary text, `muted` tertiary text and captions.
 * - `line` decorative dividers and card borders; `line-strong` borders that identify a
 *   control (inputs, checkboxes, the off switch), which need 3:1.
 * - `primary` / `on-primary` the near-black primary button.
 * - `success` is the green "Provided"; `warning` and `danger` always come with an icon.
 * - Category `fg` is text on its `bg` tint; `solid` is icons, pins and chart marks.
 */
export const colors: Record<Theme, Record<ColorToken, string>> = {
  light: {
    bg: '#FBFAF7',
    surface: '#FFFFFF',
    'surface-2': '#F3F0EA',
    ink: '#1C1B19',
    'ink-2': '#4A4740',
    muted: '#6B675F',
    line: '#E6E1D8',
    'line-strong': '#8C877D',
    primary: '#1C1B19',
    'on-primary': '#FFFFFF',
    success: '#1F6B43',
    'success-bg': '#E3F1E8',
    warning: '#8A5300',
    'warning-bg': '#FBEFD9',
    danger: '#B42318',
    'danger-bg': '#FCE9E7',
    focus: '#2457C5',
    'maritime-fg': '#003949',
    'maritime-bg': '#DBF3FC',
    'maritime-solid': '#0E7490',
    'seasonal-fg': '#4B4300',
    'seasonal-bg': '#F4EEB8',
    'seasonal-solid': '#A08318',
    'farm-fg': '#354316',
    'farm-bg': '#EAF8D4',
    'farm-solid': '#74915E',
    'remote-fg': '#41094C',
    'remote-bg': '#FBECFE',
    'remote-solid': '#652A72',
  },
  dark: {
    bg: '#141311',
    surface: '#1D1B18',
    'surface-2': '#282622',
    ink: '#F4F1EA',
    'ink-2': '#D2CDC3',
    muted: '#A9A397',
    line: '#36332E',
    'line-strong': '#7D776C',
    primary: '#F4F1EA',
    'on-primary': '#1C1B19',
    success: '#7FD3A0',
    'success-bg': '#163524',
    warning: '#F2B860',
    'warning-bg': '#3A2A10',
    danger: '#F59990',
    'danger-bg': '#45201C',
    focus: '#8AB4F8',
    'maritime-fg': '#C9EBF8',
    'maritime-bg': '#011E28',
    'maritime-solid': '#3D859D',
    'seasonal-fg': '#F3EFB0',
    'seasonal-bg': '#241F0C',
    'seasonal-solid': '#F3EFB0',
    'farm-fg': '#CCF3AE',
    'farm-bg': '#131E0A',
    'farm-solid': '#5F8938',
    'remote-fg': '#F1DCF5',
    'remote-bg': '#251229',
    'remote-solid': '#C282D0',
  },
};

/** Radius scale in px (`rounded-sm` ... `rounded-2xl`; `rounded-full` for pills and avatars). */
export const radii = { sm: 8, md: 12, lg: 14, xl: 20, '2xl': 24 } as const;

/** Font sizes in px; each is a `text-<size>` utility with its own line height. */
export const typeScale = [12, 13, 14, 15, 16, 17, 19, 21, 24, 28, 32] as const;
export type TypeSize = (typeof typeScale)[number];

export const shadowNames = ['card', 'raised', 'overlay'] as const;
export type ShadowName = (typeof shadowNames)[number];

/** The CSS variable for a color token, for places that need a value rather than a class (charts). */
export function tokenVar(name: ColorToken): string {
  return `var(--ee-${name})`;
}

export type TokenPair = { name: string; fg: string; bg: string; min: 4.5 | 3 };

/** Text needs 4.5:1; UI marks (icons, pins, focus rings, control borders) need 3:1. */
const pairSpecs: { fg: ColorToken; bg: ColorToken; min: 4.5 | 3 }[] = [
  ...(['ink', 'ink-2', 'muted'] as const).flatMap((fg) =>
    (['bg', 'surface', 'surface-2'] as const).map((bg) => ({ fg, bg, min: 4.5 as const })),
  ),
  { fg: 'on-primary', bg: 'primary', min: 4.5 },
  { fg: 'success', bg: 'success-bg', min: 4.5 },
  { fg: 'success', bg: 'surface', min: 4.5 },
  { fg: 'success', bg: 'bg', min: 4.5 },
  { fg: 'warning', bg: 'warning-bg', min: 4.5 },
  { fg: 'warning', bg: 'surface', min: 4.5 },
  { fg: 'danger', bg: 'danger-bg', min: 4.5 },
  { fg: 'danger', bg: 'surface', min: 4.5 },
  ...categories.flatMap((c) => [
    { fg: `${c}-fg` as const, bg: `${c}-bg` as const, min: 4.5 as const },
    { fg: `${c}-solid` as const, bg: 'surface' as const, min: 3 as const },
    { fg: `${c}-solid` as const, bg: 'bg' as const, min: 3 as const },
  ]),
  { fg: 'focus', bg: 'bg', min: 3 },
  { fg: 'focus', bg: 'surface', min: 3 },
  { fg: 'line-strong', bg: 'surface', min: 3 },
  { fg: 'line-strong', bg: 'bg', min: 3 },
  { fg: 'primary', bg: 'bg', min: 3 },
];

export const tokenPairs: TokenPair[] = themes.flatMap((theme) =>
  pairSpecs.map(({ fg, bg, min }) => ({
    name: `${theme}: ${fg} on ${bg}`,
    fg: colors[theme][fg],
    bg: colors[theme][bg],
    min,
  })),
);
