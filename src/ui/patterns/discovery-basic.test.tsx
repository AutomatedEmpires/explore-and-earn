// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BedDouble } from '@/ui/icons';
import { ActionBar, type ActionBarProps } from './ActionBar';
import { JobChipSheet } from './JobChipSheet';
import { OffsiteNotice } from './OffsiteNotice';
import { SignInPrompt, type SignInPromptProps } from './SignInPrompt';

describe('SignInPrompt', () => {
  const base: SignInPromptProps = {
    open: true,
    onOpenChange: () => {},
    action: 'save',
    variant: 'guest',
    signInHref: '/sign-in?redirect_url=%2F%3Fintent%3Dsave%253A1',
    signUpHref: '/sign-up?redirect_url=%2F%3Fintent%3Dsave%253A1',
  };

  it.each([
    ['save', 'Sign in to save jobs'],
    ['apply', 'Sign in to apply'],
    ['skip', 'Sign in to hide this job'],
    ['alert', 'Sign in to get job alerts'],
  ] as const)('titles the %s prompt "%s"', (action, title) => {
    render(<SignInPrompt {...base} action={action} />);
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('links "Sign in" and "Create account" to the given hrefs', () => {
    render(<SignInPrompt {...base} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      base.signInHref,
    );
    expect(within(dialog).getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      base.signUpHref,
    );
  });

  it('tells a host or operator account that saving and applying need a seeker account', () => {
    render(<SignInPrompt {...base} variant="wrong_account" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Saving and applying need a seeker account.');
    expect(within(dialog).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      base.signInHref,
    );
  });

  it('closes from its Close button', () => {
    const onOpenChange = vi.fn();
    render(<SignInPrompt {...base} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('OffsiteNotice', () => {
  const url = 'https://apply.kettleridge.com/form?job=lift';

  it('names the domain and warns never to pay', () => {
    render(
      <OffsiteNotice open onOpenChange={() => {}} url={url} domain="apply.kettleridge.com" />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "You're going to apply.kettleridge.com, which isn't part of Explore&Earn. Never pay to get a job.",
    );
  });

  it('continues in a new tab with noopener noreferrer, and Cancel closes it', () => {
    const onOpenChange = vi.fn();
    render(
      <OffsiteNotice open onOpenChange={onOpenChange} url={url} domain="apply.kettleridge.com" />,
    );
    const go = screen.getByRole('link', { name: /Continue/ });
    expect(go.tagName).toBe('A');
    expect(go).toHaveAttribute('href', url);
    expect(go).toHaveAttribute('target', '_blank');
    expect(go).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each(['http://apply.kettleridge.com/form', 'javascript:alert(1)', 'not a url'])(
    'renders no Continue link for %s',
    (bad) => {
      render(
        <OffsiteNotice open onOpenChange={() => {}} url={bad} domain="apply.kettleridge.com" />,
      );
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    },
  );
});

describe('ActionBar', () => {
  const base: ActionBarProps = {
    saved: false,
    applied: false,
    closed: false,
    onSkip: () => {},
    onApply: () => {},
    onSave: () => {},
  };

  it('runs Skip, Apply and Save, and pads by the safe area', () => {
    const onSkip = vi.fn();
    const onApply = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <ActionBar {...base} onSkip={onSkip} onApply={onApply} onSave={onSave} />,
    );
    expect(container.firstElementChild).toHaveClass('pb-safe');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect([onSkip, onApply, onSave].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a saved listing as pressed', () => {
    render(<ActionBar {...base} saved />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "Applied", disabled, once applied', () => {
    render(<ActionBar {...base} applied />);
    expect(screen.getByRole('button', { name: 'Applied' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('has no Apply on a closed listing', () => {
    render(<ActionBar {...base} closed />);
    expect(screen.queryByRole('button', { name: /^Appl/ })).toBeNull();
  });

  it('offers "Remove" on a closed listing the seeker saved', () => {
    const onSave = vi.fn();
    const { container } = render(<ActionBar {...base} closed saved onSave={onSave} />);
    expect(screen.queryByRole('button', { name: /^Appl/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild).toHaveClass('pb-safe');
  });
});

describe('JobChipSheet', () => {
  it('lists the lines and links to the listing', () => {
    render(
      <JobChipSheet
        open
        onOpenChange={() => {}}
        title="Housing"
        icon={BedDouble}
        lines={['$150/week · deducted from pay', 'Shared staff cabin.']}
        footer={{ label: 'All housing details on the listing', href: '/jobs/view/1/lift' }}
      />,
    );
    const sheet = screen.getByRole('dialog', { name: 'Housing' });
    expect(within(sheet).getByText('$150/week · deducted from pay')).toBeInTheDocument();
    expect(within(sheet).getByText('Shared staff cabin.')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('link', { name: 'All housing details on the listing' }),
    ).toHaveAttribute('href', '/jobs/view/1/lift');
  });
});
