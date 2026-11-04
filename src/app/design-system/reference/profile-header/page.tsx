import type { Metadata } from 'next';
import { ProfileScreen } from '../../_reference/ProfileScreen';

export const metadata: Metadata = { title: 'Reference: Profile header' };

/** The design board's seeker Profile artboard. */
export default function ProfileHeaderReference() {
  return <ProfileScreen />;
}
