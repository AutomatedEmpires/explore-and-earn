// discovery.alert_weekly: the weekly job digest (SP3 spec 8.10). W0 placeholder: one line in
// the shared Layout; SP3 W4 renders the week's new jobs here (Task 30).
import { Text } from '@react-email/components';
import { Layout, Title, styles, type FooterProps } from './Layout';

export type JobAlertWeeklyProps = {
  title: string;
  body: string;
  footer: FooterProps;
};

export default function JobAlertWeekly({ title, body, footer }: JobAlertWeeklyProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
    </Layout>
  );
}
