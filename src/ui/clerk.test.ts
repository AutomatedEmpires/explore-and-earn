import { describe, expect, it } from 'vitest';
import { clerkAppearance } from './clerk';

describe('Clerk appearance targets (#155 D3-5)', () => {
  it('makes the footer links ("Sign up", "Use another email") 44 px high and centred', () => {
    const link = clerkAppearance.elements.footerActionLink;
    expect(link.minHeight).toBe('2.75rem');
    // min-height does nothing on an inline link, so it lays out as an inline flex box.
    expect(link.display).toBe('inline-flex');
    expect(link.alignItems).toBe('center');
  });

  it('keeps the footer link styling', () => {
    expect(clerkAppearance.elements.footerActionLink).toMatchObject({
      color: 'var(--ee-ink)',
      fontWeight: 700,
      textDecoration: 'underline',
    });
  });
});
