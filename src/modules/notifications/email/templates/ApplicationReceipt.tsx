// applications.submitted: the seeker's receipt for an application they just sent (SP4 spec 6).
// It names the job and the host only; the answers and the profile stay in the app.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type ApplicationReceiptProps = {
  firstName: string;
  listingTitle: string;
  orgName: string;
  /** ISO timestamp; the line is left out when unknown. */
  submittedAt: string | null;
  receiptUrl: string | null;
  footer: FooterProps;
};

function day(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ApplicationReceipt({
  firstName,
  listingTitle,
  orgName,
  submittedAt,
  receiptUrl,
  footer,
}: ApplicationReceiptProps) {
  const job = listingTitle && orgName ? `${listingTitle} at ${orgName}` : listingTitle || orgName;
  const greeting = firstName ? `Hi ${firstName}, your` : 'Your';
  const lead = `${greeting} application for ${job || 'the job'} is in.`;
  const sentOn = day(submittedAt);
  return (
    <Layout preview={lead} footer={footer}>
      <Title>Your application was sent</Title>
      <Text style={styles.paragraph}>{lead}</Text>
      <Text style={styles.paragraph}>
        {sentOn ? `You applied on ${sentOn}. ` : ''}
        {
          "You can see exactly what the host received, and follow your application's status, in your receipt."
        }
      </Text>
      <Action href={receiptUrl}>View your receipt</Action>
    </Layout>
  );
}
