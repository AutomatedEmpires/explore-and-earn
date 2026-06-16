import type { ReactNode } from "react";

import { SeekerPage } from "./SeekerPage";

export interface BucketPageProps {
  readonly title: string;
  readonly description?: string;
  /** Optional "up to hub" affordance (e.g. "/profile"). */
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly children: ReactNode;
}

/**
 * Lifecycle/account bucket scaffold. Thin wrapper over the shared `SeekerPage`
 * template so every bucket page inherits one header treatment + section rhythm.
 */
export function BucketPage({
  title,
  description,
  backHref,
  backLabel,
  actionLabel,
  actionHref,
  children,
}: BucketPageProps) {
  return (
    <SeekerPage
      title={title}
      description={description}
      backHref={backHref}
      backLabel={backLabel}
      actionLabel={actionLabel}
      actionHref={actionHref}
    >
      {children}
    </SeekerPage>
  );
}
