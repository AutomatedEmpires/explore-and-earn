'use client';

// MuteToggle: mutes or unmutes a host for the seeker (SP4 spec 8.7).
// W0 contract stub (SP4 plan Task 6): W7 builds it (Task 34) after the founder approves
// the design in Figma. Until then it renders nothing; the props are the contract.
import type { ReactNode } from 'react';

export type MuteToggleProps = {
  orgId: string;
  orgName: string;
  muted: boolean;
  onChange?(muted: boolean): void;
};

export function MuteToggle(_props: MuteToggleProps): ReactNode {
  return null;
}
