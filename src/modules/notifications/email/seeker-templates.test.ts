// SP4's seeker emails render through the shared Layout.
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderEmail } from './send';
import ApplicationReceipt from './templates/ApplicationReceipt';
import AvailabilityReconfirm from './templates/AvailabilityReconfirm';
import SeekerNotice from './templates/SeekerNotice';

const footer = {
  mailingAddress: '1 Main St, Juneau, AK',
  manageUrl: 'http://localhost:3000/profile/notifications',
  unsubscribeUrl: 'http://localhost:3000/unsubscribe?t=x',
};

describe('seeker email templates', () => {
  it('ApplicationReceipt names the job and the host', async () => {
    const { html, text } = await renderEmail(
      createElement(ApplicationReceipt, {
        firstName: 'Maya',
        listingTitle: 'Deckhand',
        orgName: 'Kettle Ridge Lodge',
        submittedAt: '2026-11-03T17:00:00.000Z',
        receiptUrl: 'http://localhost:3000/profile/applications/a1',
        footer,
      }),
    );
    expect(html).toContain('Deckhand');
    expect(html).toContain('Kettle Ridge Lodge');
    expect(html).toContain('http://localhost:3000/profile/applications/a1');
    expect(text).toContain('Nov 3, 2026');
    expect(text).toContain('Hi Maya');
  });

  it('AvailabilityReconfirm shows the notification text and the button', async () => {
    const { html } = await renderEmail(
      createElement(AvailabilityReconfirm, {
        title: 'Are you still available from Dec 3, 2026?',
        body: 'Confirm your date so hosts know.',
        url: 'http://localhost:3000/profile?sheet=availability',
        footer,
      }),
    );
    expect(html).toContain('Confirm your date so hosts know.');
    expect(html).toContain('Update your availability');
  });

  it('SeekerNotice shows a heading, lines and a button', async () => {
    const { html } = await renderEmail(
      createElement(SeekerNotice, {
        heading: 'We removed part of your profile',
        lines: ['Your headline did not meet our rules.'],
        button: { label: 'Open your profile', href: 'http://localhost:3000/profile' },
        footer,
      }),
    );
    expect(html).toContain('We removed part of your profile');
    expect(html).toContain('Open your profile');
  });
});
