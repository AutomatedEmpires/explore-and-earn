// A single hiring notice: invite, interview or offer. One plain line and one button.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type HiringUpdateProps = {
  title: string;
  body: string;
  url: string | null;
  footer: FooterProps;
};

export default function HiringUpdate({ title, body, url, footer }: HiringUpdateProps) {
  return (
    <Layout preview={body} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <Action href={url}>Open Explore&amp;Earn</Action>
    </Layout>
  );
}
