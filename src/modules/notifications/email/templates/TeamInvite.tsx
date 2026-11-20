// TeamInvite: an invitation to join a host's team. Sent with sendEmailNow, so the accept link
// (which carries the invitation token) is never stored in the outbox.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type AnyFooterProps } from './Layout';

export type TeamInviteProps = {
  orgName: string;
  inviterName: string;
  /** The role as shown to the invitee, e.g. "Recruiter". */
  role: string;
  acceptUrl: string;
  /** An ISO instant (shown as a date) or text to show as is. */
  expiresAt: string;
  footer: AnyFooterProps;
};

export function teamInviteSubject(orgName: string): string {
  return `Join ${orgName} on Explore&Earn`;
}

function formatExpiry(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function TeamInvite({
  orgName,
  inviterName,
  role,
  acceptUrl,
  expiresAt,
  footer,
}: TeamInviteProps) {
  const intro = `${inviterName} invited you to join ${orgName} on Explore&Earn as ${role}.`;
  return (
    <Layout preview={intro} footer={footer}>
      <Title>{teamInviteSubject(orgName)}</Title>
      <Text style={styles.paragraph}>{intro}</Text>
      <Action href={acceptUrl}>Accept invitation</Action>
      <Text style={{ ...styles.paragraph, fontSize: '14px', margin: '16px 0 0' }}>
        {`This invitation expires on ${formatExpiry(expiresAt)}. If you weren't expecting it, you can ignore this email.`}
      </Text>
    </Layout>
  );
}
