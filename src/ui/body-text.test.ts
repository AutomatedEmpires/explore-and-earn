// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clerkAppearance } from './clerk';
import { buttonVariants } from './components/Button';
import { Checkbox } from './components/Checkbox';
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

  it('sizes the md Button at 16px', () => {
    const md = buttonVariants({ size: 'md' });
    expect(md).toContain('text-16');
    expect(md).not.toContain('text-15');
  });

  it('sizes the Checkbox label at 16px', () => {
    render(createElement(Checkbox, { label: 'Housing provided' }));
    const label = screen.getByText('Housing provided');
    expect(label).toHaveClass('text-16');
    expect(label).not.toHaveClass('text-15');
  });
});
