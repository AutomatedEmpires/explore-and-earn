import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountPanel } from '@/app/_components/AccountPanel';
import { hostPage } from '@/server/shell';
import { ChevronRight } from '@/ui/icons';
import { HOST_MORE } from '../_components/nav';

export const metadata: Metadata = { title: 'More · Explore&Earn' };

// The phone bottom tabs end in "More": every workspace section that isn't a tab, and the
// account (the phone top bar holds Notifications and the organization, not an avatar menu).
export default async function HostMorePage() {
  const { user } = await hostPage('/host/more');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">More</h1>
      <nav aria-label="More">
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {HOST_MORE.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 px-4 text-16 font-semibold text-ink no-underline hover:bg-surface-2 motion-safe:transition-colors"
              >
                <Icon className="size-5 text-ink-2" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <AccountPanel email={user.email} />
    </div>
  );
}
