// The daily and weekly job alert emails (SP3 plan Task 30): each saved search with its jobs'
// title, host, location, pay, housing and meals lines and a "See all" link, inside the shared
// Layout, naming filters and never the seeker.
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderEmail } from '../send';
import JobAlertDaily, { jobAlertProps, type JobAlertSearch } from './JobAlertDaily';
import JobAlertWeekly from './JobAlertWeekly';
import type { FooterProps } from './Layout';

const footer: FooterProps = {
  mailingAddress: '1 Harbor Way, Seward, AK 99664',
  manageUrl: 'http://localhost:3000/settings/notifications',
  unsubscribeUrl: 'http://localhost:3000/unsubscribe?token=abc',
};

const job = (title: string, o: Partial<JobAlertSearch['items'][number]> = {}) => ({
  title,
  host: 'Kettle Ridge Lodge',
  location: 'Breckenridge, CO',
  pay: '$19/hr',
  housing: 'Housing provided · $150/week · deducted from pay',
  meals: 'No meals',
  href: `http://localhost:3000/jobs/view/1/${title.toLowerCase().replace(/ /g, '-')}?source=other`,
  ...o,
});

const ski: JobAlertSearch = {
  name: 'Ski resorts · CO',
  url: 'http://localhost:3000/?genre=ski-resorts&state=CO&sort=newest',
  items: [job('Lift operator'), job('Ski instructor')],
};

const maritime: JobAlertSearch = {
  name: 'Maritime · AK',
  url: 'http://localhost:3000/?cat=maritime&state=AK&sort=newest',
  items: [
    job('Deckhand', {
      host: 'Seward Fishing Co',
      location: 'Seward, AK',
      pay: 'Crew share · est. $8,000–$12,000/season',
      housing: 'No housing',
      meals: 'Meals provided · Free',
    }),
  ],
};

const searches = [ski, maritime];

describe('JobAlertDaily', () => {
  it('lists each search with its jobs and a "See all" link', async () => {
    const { html, text } = await renderEmail(
      createElement(JobAlertDaily, {
        title: 'New jobs for your alerts',
        body: '3 new jobs across your saved searches.',
        footer,
        searches,
      }),
    );
    expect(html).toContain('Ski resorts · CO');
    expect(html).toContain('Maritime · AK');
    expect(html.match(/See all/g)).toHaveLength(2);
    expect(html).toContain('Housing provided · $150/week · deducted from pay');
    expect(html).toContain(
      'href="http://localhost:3000/?genre=ski-resorts&amp;state=CO&amp;sort=newest"',
    );
    expect(html).toContain('Seward Fishing Co');
    expect(text).toContain('Lift operator');
    expect(text).toContain('Crew share · est. $8,000–$12,000/season');
    expect(text).toContain('Meals provided · Free');
    expect(text).toContain('3 new jobs across your saved searches.');
    // The Layout's footer: manage, unsubscribe and the mailing address.
    expect(text).toContain('Unsubscribe');
    expect(text).toContain('1 Harbor Way, Seward, AK 99664');
    // Filters, never the seeker (seedSeeker's display name).
    expect(text).not.toContain('Maya');
  });

  it('renders host text as text, never as markup', async () => {
    const { html } = await renderEmail(
      createElement(JobAlertDaily, {
        title: 'New jobs for your alerts',
        body: '1 new job across your saved searches.',
        footer,
        searches: [{ ...ski, items: [job('<b>Lift</b> operator')] }],
      }),
    );
    expect(html).not.toContain('<b>Lift</b>');
    expect(html).toContain('&lt;b&gt;Lift&lt;/b&gt; operator');
  });

  it('still renders its title and body without searches', async () => {
    const { text } = await renderEmail(
      createElement(JobAlertDaily, {
        title: 'New jobs for your alerts',
        body: '2 new jobs across your saved searches.',
        footer,
      }),
    );
    expect(text).toContain('New jobs for your alerts');
    expect(text).not.toContain('See all');
  });
});

describe('JobAlertWeekly', () => {
  it('lists the week under one search', async () => {
    const { html, text } = await renderEmail(
      createElement(JobAlertWeekly, {
        title: 'Your weekly job digest',
        body: '2 new jobs this week.',
        footer,
        searches: [
          {
            name: 'Your saved searches',
            url: 'http://localhost:3000/profile/alerts',
            items: [job('Lift operator'), job('Orchard picker')],
          },
        ],
      }),
    );
    expect(text).toContain('Your weekly job digest');
    expect(text).toContain('Your saved searches');
    expect(text).toContain('Orchard picker');
    expect(html.match(/See all/g)).toHaveLength(1);
  });
});

describe('jobAlertProps', () => {
  it('reads the searches from the notification data', () => {
    expect(jobAlertProps({ count: 3, searches })).toEqual({ searches });
  });

  it('drops searches without jobs and anything that is not an http(s) link', () => {
    const bad = { ...ski, url: 'javascript:alert(1)' };
    const badItem = { ...maritime, items: [job('Deckhand', { href: 'javascript:alert(1)' })] };
    expect(jobAlertProps({ searches: [{ ...ski, items: [] }, bad, badItem, maritime] })).toEqual({
      searches: [maritime],
    });
  });

  it('gives no searches for data it cannot read', () => {
    expect(jobAlertProps(null)).toEqual({ searches: [] });
    expect(jobAlertProps({ searches: 'all' })).toEqual({ searches: [] });
  });
});
