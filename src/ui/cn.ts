import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { radii, shadowNames, typeScale } from './tokens';

// tailwind-merge must know the custom scales in tokens.css, or it would read `text-15` as a
// color and drop it when merged with `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: typeScale.map(String),
      radius: Object.keys(radii),
      shadow: [...shadowNames],
    },
  },
});

/** Joins class names (clsx syntax) and resolves Tailwind conflicts, last one wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
