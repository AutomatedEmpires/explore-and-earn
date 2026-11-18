import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type AnyFooterProps } from './Layout';

export type SupportReplyProps = {
  ticketNumber: number;
  subject: string;
  replyBody: string;
  threadUrl: string | null;
  automatic: boolean;
  footer: AnyFooterProps;
};

export const SUPPORT_REPLY_AUTOMATIC_LINE =
  "This reply was written automatically from our Help center. Reply to this email if you'd like a person to help.";

export function supportReplySubject(ticketNumber: number, subject: string): string {
  return `Re: [#${ticketNumber}] ${subject}`;
}

export default function SupportReply({
  ticketNumber,
  subject,
  replyBody,
  threadUrl,
  automatic,
  footer,
}: SupportReplyProps) {
  return (
    <Layout preview={replyBody} footer={footer}>
      <Title>{supportReplySubject(ticketNumber, subject)}</Title>
      <Text style={styles.paragraph}>{replyBody}</Text>
      {threadUrl ? <Action href={threadUrl}>View the ticket</Action> : null}
      {automatic ? <Text style={styles.paragraph}>{SUPPORT_REPLY_AUTOMATIC_LINE}</Text> : null}
    </Layout>
  );
}
