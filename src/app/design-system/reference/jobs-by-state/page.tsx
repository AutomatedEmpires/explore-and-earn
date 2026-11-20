import type { Metadata } from 'next';
import { JobsByState } from '@/ui/components';
import { SAMPLE_OPEN_JOBS } from '@/ui/maps/sample-open-jobs';

export const metadata: Metadata = { title: 'Reference: Jobs by state' };

/** The browse-by-state map. Counts are a sample until discovery supplies live totals. */
export default function JobsByStateReference() {
  return (
    <main className="min-h-screen bg-surface px-6 py-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        <JobsByState openJobs={SAMPLE_OPEN_JOBS} />
        <p className="mt-8 text-center text-13 text-muted">
          Sample counts, so the map can be tried. Live totals arrive with discovery.
        </p>
      </div>
    </main>
  );
}
