// @vitest-environment jsdom
// ApplicationSnapshotView (SP4 plan Task 35): the frozen application, from the snapshot alone.
// Work authorization keeps the founder's two-answer rule for hosts (#45, 2026-11-12): a host
// sees "authorized" or "needs sponsorship", never a visa type or end date.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mayaApplicationSnapshot, mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { seriousOrCritical } from '../safety/axe-test-helper';
import { ApplicationSnapshotView } from './ApplicationSnapshotView';

const RESUME = '/api/v1/me/applications/app_1/resume.pdf';

describe('ApplicationSnapshotView', () => {
  it('shows the listing, the person, their experience and self-reported certifications', () => {
    render(
      <ApplicationSnapshotView
        snapshot={mayaApplicationSnapshot()}
        audience="seeker"
        resumeHref={RESUME}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Deckhand', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Kettle Ridge Lodge · Juneau, AK')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Maya Rodriguez' })).toBeInTheDocument();
    expect(screen.getByText('Deckhand, Kettle Ridge Lodge')).toBeInTheDocument();
    const certifications = screen.getByRole('region', { name: 'Certifications' });
    expect(within(certifications).getByText('First Aid/CPR')).toBeInTheDocument();
    expect(within(certifications).getByText('Self-reported')).toBeInTheDocument();
  });

  it('keeps the PDF section order', () => {
    render(
      <ApplicationSnapshotView
        snapshot={mayaApplicationSnapshot()}
        audience="host"
        resumeHref={RESUME}
      />,
    );
    const sections = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label') ?? region.textContent?.split('\n')[0]);
    const order = ['Experience', 'Education', 'Skills', 'Certifications', 'Languages', 'Answers'];
    expect(sections.filter((name) => order.includes(name ?? ''))).toEqual(order);
  });

  it('shows the work authorization line, with the visa type only to the seeker', () => {
    const snapshot = mayaApplicationSnapshot({
      profile: mayaSnapshot({
        workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] },
      }),
    });
    const { unmount } = render(
      <ApplicationSnapshotView snapshot={snapshot} audience="seeker" resumeHref={RESUME} />,
    );
    expect(screen.getByText('Needs visa sponsorship (H-2B)')).toBeInTheDocument();
    unmount();

    render(<ApplicationSnapshotView snapshot={snapshot} audience="host" resumeHref={RESUME} />);
    expect(screen.getByText('Needs visa sponsorship')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/H-2B/);
  });

  it('never shows a host the visa a seeker holds or when it ends', () => {
    const snapshot = mayaApplicationSnapshot({
      profile: mayaSnapshot({
        workAuthorization: { status: 'has_visa', visaType: 'j1', endsOn: '2027-09-30' },
      }),
    });
    render(<ApplicationSnapshotView snapshot={snapshot} audience="host" resumeHref={RESUME} />);
    expect(screen.getByText('Can work in the US now')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/J-1|2027-09-30|Sep 30, 2027/);
  });

  it('shows each answer under its prompt', () => {
    render(
      <ApplicationSnapshotView
        snapshot={mayaApplicationSnapshot()}
        audience="seeker"
        resumeHref={RESUME}
      />,
    );
    const answers = screen.getByRole('region', { name: 'Your answers' });
    expect(within(answers).getByText('Have you worked on a boat before?')).toBeInTheDocument();
    expect(within(answers).getByText('Yes')).toBeInTheDocument();
    expect(within(answers).getByText('When could you start?')).toBeInTheDocument();
    expect(within(answers).getByText('Mid May')).toBeInTheDocument();
  });

  it('says the seeker confirmed applying without sponsorship, when they did', () => {
    render(
      <ApplicationSnapshotView
        snapshot={mayaApplicationSnapshot({ sponsorshipMismatchAcknowledged: true })}
        audience="seeker"
        resumeHref={RESUME}
      />,
    );
    expect(
      screen.getByText("You confirmed you'd apply without visa sponsorship."),
    ).toBeInTheDocument();
  });

  it('links the resume that was sent', () => {
    render(
      <ApplicationSnapshotView
        snapshot={mayaApplicationSnapshot()}
        audience="host"
        resumeHref={RESUME}
      />,
    );
    expect(screen.getByRole('link', { name: 'Open resume' })).toHaveAttribute('href', RESUME);
  });

  it('only links portfolio addresses that are web pages', () => {
    const snapshot = mayaApplicationSnapshot({
      profile: mayaSnapshot({
        workAuthorization: { status: 'authorized' },
        portfolioLinks: [
          { label: 'Photos', url: 'https://example.test/maya' },
          { label: 'Trick', url: 'javascript:alert(1)' },
        ],
      }),
    });
    render(<ApplicationSnapshotView snapshot={snapshot} audience="host" resumeHref={RESUME} />);
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute(
      'href',
      'https://example.test/maya',
    );
    expect(screen.queryByRole('link', { name: 'Trick' })).not.toBeInTheDocument();
    expect(screen.getByText('Trick')).toBeInTheDocument();
  });
});

describe('ApplicationSnapshotView accessibility', () => {
  it.each(['seeker', 'host'] as const)(
    'has no serious or critical axe violations for the %s',
    async (audience) => {
      const { container } = render(
        <ApplicationSnapshotView
          snapshot={mayaApplicationSnapshot({ sponsorshipMismatchAcknowledged: true })}
          audience={audience}
          resumeHref={RESUME}
        />,
      );
      expect(await seriousOrCritical(container)).toEqual([]);
    },
  );
});
