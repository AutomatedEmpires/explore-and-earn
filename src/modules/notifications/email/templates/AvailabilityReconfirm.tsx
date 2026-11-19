// profiles.availability_reconfirm and profiles.availability_hidden: asks the seeker to confirm or
// update the date they can start (SP4 spec 8.2). Title and body come from the notification.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type AvailabilityReconfirmProps = {
  title: string;
  body: string;
  url: string | null;
  footer: FooterProps;
};

export default function AvailabilityReconfirm({
  title,
  body,
  url,
  footer,
}: AvailabilityReconfirmProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      {body
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line, i) => (
          <Text key={i} style={styles.paragraph}>
            {line}
          </Text>
        ))}
      <Action href={url}>Update your availability</Action>
    </Layout>
  );
}
