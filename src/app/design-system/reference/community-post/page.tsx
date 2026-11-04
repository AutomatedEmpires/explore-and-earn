import type { Metadata } from 'next';
import { CommunityScreen } from '../../_reference/CommunityScreen';

export const metadata: Metadata = { title: 'Reference: Community post' };

/** The design board's Community artboard: a photo post, its reactions, and an announcement. */
export default function CommunityPostReference() {
  return <CommunityScreen />;
}
