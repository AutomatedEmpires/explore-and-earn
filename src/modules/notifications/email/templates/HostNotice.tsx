// HostNotice: a notice to a host team (listings, team, verification): a heading, a few lines
// and one button. Notifications feed it their title, their body split on newlines and
// `data.href`; direct emails pass these props as their data.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type AnyFooterProps } from './Layout';

export type NoticeProps = {
  heading: string;
  lines: string[];
  button: { label: string; href: string };
  footer: AnyFooterProps;
};

export function Notice({
  heading,
  lines,
  button,
  footer,
  label,
}: NoticeProps & { label?: string }) {
  return (
    <Layout preview={lines[0] ?? heading} footer={footer}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Title>{heading}</Title>
      {lines.map((line, i) => (
        <Text key={i} style={styles.paragraph}>
          {line}
        </Text>
      ))}
      <Action href={button.href}>{button.label}</Action>
    </Layout>
  );
}

export default function HostNotice(props: NoticeProps) {
  return <Notice {...props} />;
}
