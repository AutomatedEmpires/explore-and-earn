// discovery.alert_daily: the daily job alert email (SP3 spec 8.10). W0 placeholder: one line
// in the shared Layout; SP3 W4 renders each saved search's new jobs here (Task 30).
import { Text } from '@react-email/components';
import { Layout, Title, styles, type FooterProps } from './Layout';

export type JobAlertDailyProps = {
  title: string;
  body: string;
  footer: FooterProps;
};

export default function JobAlertDaily({ title, body, footer }: JobAlertDailyProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
    </Layout>
  );
}
