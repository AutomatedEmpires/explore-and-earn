// Users & orgs is a placeholder until the full operator console (spec section 11: every
// navigation destination exists). Placeholders do not exist in prod.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { EmptyState } from '@/ui/components';
import { Users } from '@/ui/icons';
import { PageHeader, Panel } from '../_components/parts';
import { requireConsoleOperator } from '../_lib/session';

export const metadata: Metadata = { title: 'Users & orgs' };

export default async function UsersPage() {
  if (getEnv().APP_ENV === 'prod') notFound();
  await requireConsoleOperator();

  return (
    <>
      <PageHeader title="Users & orgs" />
      <Panel>
        <EmptyState
          icon={Users}
          title="Coming in sub-project 8: Trust, privacy and launch readiness"
          description="Search people and organizations, see their full history, and suspend, restore or refund them."
        />
      </Panel>
    </>
  );
}
