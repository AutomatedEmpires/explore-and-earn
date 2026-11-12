// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Notice } from './Notice';

describe('Notice', () => {
  it('shows the title, the description and the action', () => {
    render(
      <Notice
        tone="warning"
        title="Pay may be below the minimum wage"
        action={<Button>Change hours</Button>}
      >
        You can still publish.
      </Notice>,
    );
    expect(screen.getByText('Pay may be below the minimum wage')).toBeTruthy();
    expect(screen.getByText('You can still publish.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change hours' })).toBeTruthy();
  });

  it('is not announced unless asked', () => {
    const { container } = render(<Notice title="Saved" />);
    expect(container.querySelector('[role]')).toBeNull();
  });

  it('announces a failure as an alert and news as a status', () => {
    render(
      <>
        <Notice tone="danger" announce="assertive" title="1 photo didn't upload" />
        <Notice tone="success" announce="polite" title="Back online" />
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain("1 photo didn't upload");
    expect(screen.getByRole('status').textContent).toContain('Back online');
  });

  it('carries meaning with an icon, not color alone', () => {
    const { container } = render(<Notice tone="danger" title="Couldn't save" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
