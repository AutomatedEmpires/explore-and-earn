import type { Metadata } from 'next';
import { SeekScreen } from '../../_reference/SeekScreen';

export const metadata: Metadata = { title: 'Reference: Seek' };

/** The design board's Seek artboard: the seeker's job cards. */
export default function SeekReference() {
  return <SeekScreen />;
}
