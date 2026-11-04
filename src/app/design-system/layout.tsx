// The design-system gallery and its reference screens (foundation spec section 10). Internal:
// never indexed, and absent in production. The proxy already answers 404 there
// (src/server/host-routing.ts); this guard covers any path that reaches the app anyway.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/lib/env';
import './gallery.css';

export const metadata: Metadata = {
  title: { default: 'Design system · Explore&Earn', template: '%s · Explore&Earn design system' },
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: LayoutProps<'/design-system'>) {
  if (getEnv().APP_ENV === 'prod') notFound();
  return children;
}
