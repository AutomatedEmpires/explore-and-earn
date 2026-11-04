import type { Metadata } from 'next';
import { HostPageScreen } from '../../_reference/HostPageScreen';

export const metadata: Metadata = { title: 'Reference: Host page header' };

/** The design board's public host page artboard. */
export default function HostHeaderReference() {
  return <HostPageScreen />;
}
