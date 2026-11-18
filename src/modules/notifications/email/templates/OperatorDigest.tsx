import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type AnyFooterProps } from './Layout';

export type OperatorDigestProps = {
  dateLabel: string;
  rows: { label: string; value: string }[];
  consoleUrl: string;
  footer: AnyFooterProps;
};

export function operatorDigestSubject(dateLabel: string): string {
  return `Explore&Earn daily digest · ${dateLabel}`;
}

export default function OperatorDigest({ dateLabel, rows, consoleUrl, footer }: OperatorDigestProps) {
  return (
    <Layout preview={operatorDigestSubject(dateLabel)} footer={footer}>
      <Title>{operatorDigestSubject(dateLabel)}</Title>
      {rows.map((row) => (
        <Text key={row.label} style={styles.paragraph}>
          {row.label}: {row.value}
        </Text>
      ))}
      <Action href={consoleUrl}>Open the console</Action>
    </Layout>
  );
}
