import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins conditional classes', () => {
    expect(cn('a', false, null, undefined, { b: true, c: false }, ['d'])).toBe('a b d');
  });

  it('knows the type scale is font size, not color', () => {
    expect(cn('text-15 text-ink')).toBe('text-15 text-ink');
    expect(cn('text-13', 'text-15')).toBe('text-15');
    expect(cn('text-ink', 'text-muted')).toBe('text-muted');
  });

  it('merges token radii and shadows', () => {
    expect(cn('rounded-lg', 'rounded-full')).toBe('rounded-full');
    expect(cn('shadow-card', 'shadow-overlay')).toBe('shadow-overlay');
  });
});
