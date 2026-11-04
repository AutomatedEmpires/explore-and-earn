// The frame every Explore&Earn email shares: wordmark, content card and the footer with the
// manage and unsubscribe links and the business's mailing address (CAN-SPAM). Email clients
// don't support CSS variables, so the light-theme token values are inlined from src/ui/tokens.
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';
import { colors } from '@/ui/tokens';

const c = colors.light;

export const FONT_STACK =
  "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type FooterProps = {
  /** `business.mailing_address`; omitted from the footer while it is empty. */
  mailingAddress: string;
  manageUrl: string;
  unsubscribeUrl: string;
};

/** A direct email's footer: sent to an address, not a user, so there is nothing to manage. */
export type DirectFooterProps = { mailingAddress: string };

export type AnyFooterProps = FooterProps | DirectFooterProps;

export const styles = {
  heading: {
    color: c.ink,
    fontSize: '21px',
    fontWeight: 700,
    lineHeight: '28px',
    margin: '0 0 12px',
  },
  paragraph: {
    color: c['ink-2'],
    fontSize: '16px',
    lineHeight: '24px',
    margin: '0 0 16px',
  },
  button: {
    backgroundColor: c.primary,
    borderRadius: '12px',
    color: c['on-primary'],
    display: 'inline-block',
    fontSize: '16px',
    fontWeight: 600,
    padding: '12px 20px',
    textDecoration: 'none',
  },
  label: {
    color: c.muted,
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    margin: '0 0 8px',
    textTransform: 'uppercase',
  },
  link: { color: c.ink, textDecoration: 'underline' },
} satisfies Record<string, CSSProperties>;

const body: CSSProperties = {
  backgroundColor: c.bg,
  color: c.ink,
  fontFamily: FONT_STACK,
  margin: 0,
  padding: '24px 12px',
};

const card: CSSProperties = {
  backgroundColor: c.surface,
  border: `1px solid ${c.line}`,
  borderRadius: '14px',
  maxWidth: '560px',
  padding: '32px 28px',
};

const wordmark: CSSProperties = {
  color: c.ink,
  fontSize: '17px',
  fontWeight: 700,
  margin: '0 0 24px',
};

const footer: CSSProperties = {
  color: c.muted,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 8px',
};

/** A primary button, for the one action an email leads to. */
export function Action({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return null;
  return (
    <Section style={{ margin: '8px 0 0' }}>
      <Button href={href} style={styles.button}>
        {children}
      </Button>
    </Section>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.heading}>
      {children}
    </Heading>
  );
}

export function Layout({
  preview,
  footer: f,
  children,
}: {
  preview: string;
  footer: AnyFooterProps;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Text style={wordmark}>{'Explore&Earn'}</Text>
          {children}
          <Hr style={{ borderColor: c.line, margin: '32px 0 16px' }} />
          <Text style={footer}>
            {'Work worth going somewhere for.'}
            {'unsubscribeUrl' in f ? (
              <>
                {' '}
                <Link href={f.manageUrl} style={{ color: c.muted, textDecoration: 'underline' }}>
                  Manage notifications
                </Link>
                {' · '}
                <Link
                  href={f.unsubscribeUrl}
                  style={{ color: c.muted, textDecoration: 'underline' }}
                >
                  Unsubscribe
                </Link>
              </>
            ) : null}
          </Text>
          {f.mailingAddress ? <Text style={footer}>{f.mailingAddress}</Text> : null}
        </Container>
      </Body>
    </Html>
  );
}
