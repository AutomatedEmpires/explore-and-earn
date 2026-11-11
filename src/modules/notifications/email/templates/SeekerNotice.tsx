// SeekerNotice: a notice to a seeker about their own account (profiles.content_removed): a
// heading, a few lines and one button, in the same layout as HostNotice.
import { Notice, type NoticeProps } from './HostNotice';

export type SeekerNoticeProps = NoticeProps;

export default function SeekerNotice(props: SeekerNoticeProps) {
  return <Notice {...props} />;
}
