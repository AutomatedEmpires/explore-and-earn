'use client';

// BlockDialog: confirms a block, with the optional "Also withdraw my applications to this host"
// for a seeker blocking a host (SP4 spec 7 and 8.7).
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 34) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';

export type BlockDialogProps =
  | {
      by: 'seeker';
      target: { type: 'org' | 'user'; id: string; name: string };
      offerWithdraw: boolean;
      open: boolean;
      onOpenChange(open: boolean): void;
      onBlocked?(): void;
    }
  | {
      by: 'host';
      applicationId: string;
      firstName: string;
      open: boolean;
      onOpenChange(open: boolean): void;
      onBlocked?(): void;
    };

export function BlockDialog(_props: BlockDialogProps): ReactNode {
  return null;
}
