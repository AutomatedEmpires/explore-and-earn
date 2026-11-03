// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a real button, 44 px tall at size md', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Apply</Button>);
    const button = screen.getByRole('button', { name: 'Apply' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('h-11');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is 48 px tall at size lg', () => {
    render(<Button size="lg">Apply</Button>);
    expect(screen.getByRole('button').className).toContain('h-12');
  });

  it('renders its child element with the button styles when asChild is set', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/listing" className="extra">
          All housing details
        </a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'All housing details' });
    expect(link).toHaveAttribute('href', '/listing');
    expect(link.className).toContain('extra');
    expect(link.className).toContain('rounded-full');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is busy and disabled while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
