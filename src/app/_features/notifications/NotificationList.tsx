'use client';

// NotificationList: the in-app notifications, newest first, with mark-read (SP4 spec 7). It takes
// no role-specific props, so SP5 mounts it in the host shell as is.
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 35) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';

export type NotificationListProps = { pageSize?: number };

export function NotificationList(_props: NotificationListProps): ReactNode {
  return null;
}
