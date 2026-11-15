import { describe, expect, it } from 'vitest';
import { clerkAppearance } from './clerk';
import { controlClass } from './components/Field';

/** 1rem is 16px at the root. Inputs below that make iOS Safari zoom on focus. */
const BODY = '1rem';

function fontSize(element: unknown): unknown {
  if (typeof element === 'object' && element !== null && 'fontSize' in element) {
    return element.fontSize;
  }
  return undefined;
}

describe('body text and inputs are at least 16px (C-2)', () => {
  it('sizes text controls with the 16px token', () => {
    expect(controlClass).toContain('text-16');
    expect(controlClass).not.toContain('text-15');
  });

  it('sets Clerk body text, inputs and buttons to 1rem', () => {
    expect(clerkAppearance.variables?.fontSize).toBe(BODY);
    expect(fontSize(clerkAppearance.elements?.formFieldInput)).toBe(BODY);
    expect(fontSize(clerkAppearance.elements?.headerSubtitle)).toBe(BODY);
    expect(fontSize(clerkAppearance.elements?.formButtonPrimary)).toBe(BODY);
  });
});
