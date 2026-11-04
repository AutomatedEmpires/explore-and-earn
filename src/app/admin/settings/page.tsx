// Settings (spec section 12): limits, AI thresholds, the mailing address and the support email,
// one typed form per setting. Every change is audited (settings.updated); saving is sensitive,
// so it needs a recent sign-in confirmation, and only Owners may save.
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/modules/settings';
import { PageHeader, Panel } from '../_components/parts';
import { SettingsForms } from '../_components/SettingsForms';
import { requireConsoleOperator } from '../_lib/session';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const operator = await requireConsoleOperator();
  const values = await getAllSettings(getDb());
  const canEdit = operator.role === 'owner';

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          canEdit
            ? 'Changes apply at once and are kept in the audit log. You confirm it is you before saving.'
            : 'Only an Owner can change these.'
        }
      />
      <Panel bodyClassName="p-0">
        <SettingsForms values={values} canEdit={canEdit} />
      </Panel>
    </>
  );
}
