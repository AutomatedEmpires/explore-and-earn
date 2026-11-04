// operator.alert: an alert for the console's owners (SLA breaches, child safety and the like).
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type OperatorAlertProps = {
  title: string;
  body: string;
  url: string | null;
  severity: 'critical' | 'warning';
  footer: FooterProps;
};

export default function OperatorAlert({ title, body, url, severity, footer }: OperatorAlertProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Text style={styles.label}>{severity === 'critical' ? 'Critical' : 'Warning'}</Text>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <Action href={url}>Open the console</Action>
      <Text style={{ ...styles.paragraph, fontSize: '14px', margin: '16px 0 0' }}>
        Operator alerts are always sent, whatever your notification settings.
      </Text>
    </Layout>
  );
}
