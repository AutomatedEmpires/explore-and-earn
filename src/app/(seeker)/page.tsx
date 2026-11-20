import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { JobsByState } from '@/ui/components';
import { SAMPLE_OPEN_JOBS } from '@/ui/maps/sample-open-jobs';
import { seekerNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Seek · Explore&Earn' };

export default async function SeekPage() {
  notFoundInProd();
  await seekerPage('/', { guests: true });
  return (
    <div className="flex flex-col gap-10">
      <JobsByState openJobs={SAMPLE_OPEN_JOBS} />
      <p className="text-13 text-muted">
        Sample counts, so the map can be tried. Live totals arrive with discovery.
      </p>
      <Placeholder
        title="Seek"
        subProject={3}
        name="Discovery"
        icon={seekerNavIcons.seek}
        description="Search seasonal, maritime, farm and remote jobs, and filter for the ones with housing and meals."
      />
    </div>
  );
}
