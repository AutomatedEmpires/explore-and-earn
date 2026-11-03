// operator.mention: another operator @mentioned you in a review note.
import { Text } from '@react-email/components';
import { Action, Layout, Title, styles, type FooterProps } from './Layout';

export type OperatorMentionProps = {
  title: string;
  body: string;
  url: string | null;
  footer: FooterProps;
};

export default function OperatorMention({ title, body, url, footer }: OperatorMentionProps) {
  return (
    <Layout preview={title} footer={footer}>
      <Title>{title}</Title>
      <Text style={styles.paragraph}>{body}</Text>
      <Action href={url}>Open the item</Action>
    </Layout>
  );
}
