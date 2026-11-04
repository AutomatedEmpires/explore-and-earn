import { categories, categoryMeta, type Category } from '@/ui/categories';
import { CategoryBadge } from '@/ui/components';
import { cn } from '@/ui/cn';
import { colors, radii, typeScale, type ColorToken, type TypeSize } from '@/ui/tokens';
import { Meta, Section, Specimen } from '../Specimen';

// Literal class names, so Tailwind generates each one.
const swatchClass: Record<ColorToken, string> = {
  bg: 'bg-bg',
  surface: 'bg-surface',
  'surface-2': 'bg-surface-2',
  ink: 'bg-ink',
  'ink-2': 'bg-ink-2',
  muted: 'bg-muted',
  line: 'bg-line',
  'line-strong': 'bg-line-strong',
  primary: 'bg-primary',
  'on-primary': 'bg-on-primary',
  success: 'bg-success',
  'success-bg': 'bg-success-bg',
  warning: 'bg-warning',
  'warning-bg': 'bg-warning-bg',
  danger: 'bg-danger',
  'danger-bg': 'bg-danger-bg',
  focus: 'bg-focus',
  'maritime-fg': 'bg-maritime-fg',
  'maritime-bg': 'bg-maritime-bg',
  'maritime-solid': 'bg-maritime-solid',
  'seasonal-fg': 'bg-seasonal-fg',
  'seasonal-bg': 'bg-seasonal-bg',
  'seasonal-solid': 'bg-seasonal-solid',
  'farm-fg': 'bg-farm-fg',
  'farm-bg': 'bg-farm-bg',
  'farm-solid': 'bg-farm-solid',
  'remote-fg': 'bg-remote-fg',
  'remote-bg': 'bg-remote-bg',
  'remote-solid': 'bg-remote-solid',
};

const roleGroups: { title: string; note: string; tokens: readonly ColorToken[] }[] = [
  {
    title: 'Surfaces and lines',
    note: 'bg is the page, surface the cards and bars, surface-2 quiet fills. line divides; line-strong outlines controls (3:1).',
    tokens: ['bg', 'surface', 'surface-2', 'line', 'line-strong'],
  },
  {
    title: 'Text',
    note: 'ink for primary text, ink-2 for secondary, muted for captions. All reach 4.5:1 on every surface.',
    tokens: ['ink', 'ink-2', 'muted'],
  },
  {
    title: 'Action and focus',
    note: 'The near-black primary button and the focus ring.',
    tokens: ['primary', 'on-primary', 'focus'],
  },
  {
    title: 'Status',
    note: 'success is the green “Provided”. Warning and danger always come with an icon.',
    tokens: ['success', 'success-bg', 'warning', 'warning-bg', 'danger', 'danger-bg'],
  },
];

const textClass: Record<TypeSize, string> = {
  12: 'text-12',
  13: 'text-13',
  14: 'text-14',
  15: 'text-15',
  16: 'text-16',
  17: 'text-17',
  19: 'text-19',
  21: 'text-21',
  24: 'text-24',
  28: 'text-28',
  32: 'text-32',
};

const typeUse: Record<TypeSize, string> = {
  12: 'Chip labels, badges',
  13: 'Captions, info rows',
  14: 'Secondary text, chip values',
  15: 'Body, buttons, form text',
  16: 'Large buttons',
  17: 'Card section titles',
  19: 'Wordmark, dialog titles',
  21: 'Card titles, sheet titles',
  24: 'Section headings',
  28: 'Page titles, stat values',
  32: 'Display',
};

const radiusClass: Record<keyof typeof radii | 'full', string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

const radiusUse: Record<keyof typeof radiusClass, string> = {
  sm: 'Small logos, checkboxes',
  md: 'Icon tiles, menus, inputs’ items',
  lg: 'Chips, inputs',
  xl: 'Cards',
  '2xl': 'Sheets, dialogs',
  full: 'Buttons, pills, avatars',
};

const shadows = [
  { name: 'card', className: 'shadow-card', use: 'Cards and tiles' },
  { name: 'raised', className: 'shadow-raised', use: 'Logos on covers, thumbs' },
  { name: 'overlay', className: 'shadow-overlay', use: 'Sheets, dialogs, menus' },
] as const;

const spacing = [
  { px: 4, className: 'w-1' },
  { px: 8, className: 'w-2' },
  { px: 12, className: 'w-3' },
  { px: 16, className: 'w-4' },
  { px: 24, className: 'w-6' },
  { px: 32, className: 'w-8' },
  { px: 48, className: 'w-12' },
  { px: 64, className: 'w-16' },
] as const;

function Swatch({ token, hex }: { token: ColorToken; hex: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn('size-11 shrink-0 rounded-md border border-line', swatchClass[token])}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-14 font-semibold text-ink">{token}</span>
        <Meta>{hex}</Meta>
      </span>
    </li>
  );
}

function CategoryColors({ category, theme }: { category: Category; theme: 'light' | 'dark' }) {
  const { icon: Icon, solidText } = categoryMeta[category];
  const tones = (['fg', 'bg', 'solid'] as const).map((tone) => `${category}-${tone}` as const);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <CategoryBadge category={category} />
        <Icon className={cn('size-5', solidText)} />
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {tones.map((token) => (
          <li key={token} className="flex flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn('h-8 rounded-sm border border-line', swatchClass[token])}
            />
            <span className="text-12 font-semibold text-ink">{token.split('-')[1]}</span>
            <Meta>{colors[theme][token]}</Meta>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FoundationsSection() {
  return (
    <>
      <Section
        id="color"
        title="Color roles"
        description="Warm neutrals carry the interface. Values switch with the theme; screens use the role, never the value."
      >
        {roleGroups.map((group) => (
          <Specimen key={group.title} title={group.title} note={group.note}>
            {(theme) => (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.tokens.map((token) => (
                  <Swatch key={token} token={token} hex={colors[theme][token]} />
                ))}
              </ul>
            )}
          </Specimen>
        ))}
      </Section>

      <Section
        id="categories"
        title="Category colors"
        description="The only other color. Each category has fg (text on its tint), bg (the tint) and solid (icons, pins, chart marks), and always comes with its icon."
      >
        <Specimen title="Maritime, Seasonal, Farm, Remote">
          {(theme) => (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((c) => (
                <CategoryColors key={c} category={c} theme={theme} />
              ))}
            </div>
          )}
        </Specimen>
      </Section>

      <Section
        id="type"
        title="Type"
        description="Figtree, one family. Eleven sizes, each with its own line height; weights 400, 600, 700 and 800."
      >
        <Specimen title="Type scale" stack>
          {() => (
            <ul className="flex flex-col divide-y divide-line">
              {[...typeScale].reverse().map((size) => (
                <li
                  key={size}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <span className="flex w-48 shrink-0 flex-col">
                    <span className="text-13 font-semibold text-ink">{`text-${size}`}</span>
                    <Meta>{typeUse[size]}</Meta>
                  </span>
                  <span className={cn('min-w-0 font-semibold text-ink', textClass[size])}>
                    Work worth going somewhere for.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Specimen>
        <Specimen title="Weights">
          {() => (
            <ul className="flex flex-col gap-2 text-21 text-ink">
              <li className="font-normal">Regular 400 · body text</li>
              <li className="font-semibold">Semibold 600 · labels, links</li>
              <li className="font-bold">Bold 700 · titles, buttons, chip values</li>
              <li className="font-extrabold">Extrabold 800 · page titles, wordmark</li>
            </ul>
          )}
        </Specimen>
      </Section>

      <Section id="shape" title="Shape, depth and space">
        <Specimen title="Radius">
          {() => (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(Object.keys(radiusClass) as (keyof typeof radiusClass)[]).map((name) => (
                <li key={name} className="flex flex-col gap-2">
                  <span
                    aria-hidden="true"
                    className={cn('h-16 border border-line-strong bg-surface-2', radiusClass[name])}
                  />
                  <span className="text-14 font-semibold text-ink">
                    {name}
                    {name === 'full' ? '' : ` · ${radii[name]} px`}
                  </span>
                  <Meta>{radiusUse[name]}</Meta>
                </li>
              ))}
            </ul>
          )}
        </Specimen>
        <Specimen title="Shadows">
          {() => (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {shadows.map((s) => (
                <li key={s.name} className="flex flex-col gap-3">
                  <span
                    aria-hidden="true"
                    className={cn('h-20 rounded-xl bg-surface', s.className)}
                  />
                  <span className="flex flex-col">
                    <span className="text-14 font-semibold text-ink">{s.name}</span>
                    <Meta>{s.use}</Meta>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Specimen>
        <Specimen title="Spacing" note="Multiples of 4 px.">
          {() => (
            <ul className="flex flex-col gap-2">
              {spacing.map((s) => (
                <li key={s.px} className="flex items-center gap-4">
                  <span className="w-12 text-13 font-semibold text-ink tabular-nums">
                    {s.px} px
                  </span>
                  <span aria-hidden="true" className={cn('h-4 rounded-sm bg-ink', s.className)} />
                </li>
              ))}
            </ul>
          )}
        </Specimen>
      </Section>
    </>
  );
}
