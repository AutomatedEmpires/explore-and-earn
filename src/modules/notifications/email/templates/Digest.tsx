// A batch of notifications that stayed unread (for example messages after 15 minutes).
import { Hr, Link, Section, Text } from '@react-email/components';
import { colors } from '@/ui/tokens';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

const c = colors.light;

export type DigestItem = { title: string; body: string; url: string | null };

export type DigestProps = {
  items: DigestItem[];
  /** Where "Open Explore&Earn" leads. */
  url: string | null;
  footer: FooterProps;
};

export function digestSubject(items: DigestItem[]): string {
  const [only] = items;
  if (items.length === 1 && only) return only.title;
  return `You have ${items.length} unread notifications`;
}

export default function Digest({ items, url, footer }: DigestProps) {
  const heading = digestSubject(items);
  return (
    <Layout preview={heading} footer={footer}>
      <Title>{heading}</Title>
      {items.map((item, i) => (
        <Section key={i}>
          {i > 0 ? <Hr style={{ borderColor: c.line, margin: '16px 0' }} /> : null}
          <Text style={{ ...styles.paragraph, color: c.ink, fontWeight: 600, margin: '0 0 4px' }}>
            {item.url ? (
              <Link href={item.url} style={styles.link}>
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </Text>
          <Text style={{ ...styles.paragraph, margin: 0 }}>{item.body}</Text>
        </Section>
      ))}
      <Section style={{ margin: '24px 0 0' }}>
        <Action href={url}>Open Explore&amp;Earn</Action>
      </Section>
    </Layout>
  );
}
