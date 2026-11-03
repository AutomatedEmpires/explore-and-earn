// system.test: proves the email channel works end to end.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type SystemTestProps = {
  title: string;
  body: string;
  url: string | null;
  footer: FooterProps;
};

export default function SystemTest({ title, body, url, footer }: SystemTestProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <Action href={url}>Open Explore&amp;Earn</Action>
    </Layout>
  );
}
