// BillingNotice: a billing message to a host's billing contacts (subscription started, plan
// changed, trial ending, payment failed). Same shape as HostNotice, labeled as billing.
import { Notice, type NoticeProps } from './HostNotice';

export type BillingNoticeProps = NoticeProps;

export default function BillingNotice(props: BillingNoticeProps) {
  return <Notice {...props} label="Billing" />;
}
