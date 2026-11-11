// discovery.alert_weekly: the weekly job digest (SP3 spec 8.10, plan Task 30). The same list as
// the daily email, with one search named "Your saved searches": the 10 newest still-active jobs
// of the past 7 days, and "See all" leading to the Job alerts page.
import { Text } from '@react-email/components';
import { JobAlertSearches, type JobAlertEmailProps } from './JobAlertDaily';
import { Layout, Title, styles } from './Layout';

export type JobAlertWeeklyProps = JobAlertEmailProps;

export default function JobAlertWeekly({
  title,
  body,
  footer,
  searches = [],
}: JobAlertWeeklyProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <JobAlertSearches searches={searches} />
    </Layout>
  );
}
