// discovery.alert_daily: the daily job alert email (SP3 spec 8.10, plan Task 30). Each saved
// search with new jobs gets its name, up to 10 jobs (title, host and location, pay, housing and
// meals lines) and a "See all" link, inside the shared Layout. JobAlertWeekly reuses the list.
//
// The jobs come from the notification's data (`JobAlertEmailData` in discovery's alerts.ts):
// `jobAlertProps(data)` reads them, keeping only http(s) links and searches that have a job.
// Host text renders as text, never markup.
import { Heading, Hr, Link, Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { colors } from '@/ui/tokens';
import { Layout, Title, styles, type FooterProps } from './Layout';

const c = colors.light;

const httpUrl = z.string().refine((v) => {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
});

const itemSchema = z.object({
  title: z.string(),
  host: z.string(),
  location: z.string(),
  pay: z.string(),
  housing: z.string(),
  meals: z.string(),
  href: httpUrl,
});

const searchSchema = z.object({ name: z.string(), url: httpUrl, items: z.array(itemSchema) });

export type JobAlertSearch = z.infer<typeof searchSchema>;

/** The saved searches in a job alert notification's data; none when they can't be read. */
export function jobAlertProps(data: unknown): { searches: JobAlertSearch[] } {
  const raw = (data as { searches?: unknown } | null)?.searches;
  if (!Array.isArray(raw)) return { searches: [] };
  const searches = raw.flatMap((s) => {
    const parsed = searchSchema.safeParse(s);
    return parsed.success && parsed.data.items.length > 0 ? [parsed.data] : [];
  });
  return { searches };
}

export type JobAlertEmailProps = {
  title: string;
  body: string;
  footer: FooterProps;
  /** Without it (or with none) the email is its title and body. */
  searches?: JobAlertSearch[];
};

const searchName: CSSProperties = {
  color: c.ink,
  fontSize: '17px',
  fontWeight: 700,
  lineHeight: '24px',
  margin: '0 0 12px',
};

const jobTitle: CSSProperties = {
  ...styles.paragraph,
  color: c.ink,
  fontWeight: 600,
  margin: '0 0 2px',
};

const jobLine: CSSProperties = {
  ...styles.paragraph,
  fontSize: '14px',
  lineHeight: '20px',
  margin: 0,
};

/** Every search's jobs, then its "See all" link. */
export function JobAlertSearches({ searches }: { searches: JobAlertSearch[] }) {
  return (
    <>
      {searches.map((s, i) => (
        <Section key={i}>
          <Hr style={{ borderColor: c.line, margin: i === 0 ? '8px 0 20px' : '24px 0 20px' }} />
          <Heading as="h2" style={searchName}>
            {s.name}
          </Heading>
          {s.items.map((job, k) => (
            <Section key={k} style={{ margin: '0 0 16px' }}>
              <Text style={jobTitle}>
                <Link href={job.href} style={styles.link}>
                  {job.title}
                </Link>
              </Text>
              <Text style={jobLine}>{`${job.host} · ${job.location}`}</Text>
              <Text style={jobLine}>{job.pay}</Text>
              <Text style={jobLine}>{job.housing}</Text>
              <Text style={jobLine}>{job.meals}</Text>
            </Section>
          ))}
          <Text style={{ ...styles.paragraph, margin: '4px 0 0' }}>
            <Link href={s.url} style={styles.link}>
              See all
            </Link>
          </Text>
        </Section>
      ))}
    </>
  );
}

export default function JobAlertDaily({ title, body, footer, searches = [] }: JobAlertEmailProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <JobAlertSearches searches={searches} />
    </Layout>
  );
}
