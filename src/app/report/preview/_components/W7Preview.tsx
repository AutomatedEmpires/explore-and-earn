'use client';

// The W7 shared UI on sample content, for tests/e2e/w7-shared-ui.spec.ts (development only).
// Each screen mounts one component the way its host page will: ReportSheet from a Report
// button, BlockDialog from a Block button, MuteToggle in a settings card, the snapshot and
// candidate views in a page column, and NotificationList under its heading. Every component
// still calls the real /api/v1 routes; the spec answers them with contract-checked fakes.
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ApplicationSnapshotView } from '../../../_features/applications/ApplicationSnapshotView';
import { NotificationList } from '../../../_features/notifications/NotificationList';
import { CandidateProfileView } from '../../../_features/profiles/CandidateProfileView';
import { BlockDialog } from '../../../_features/safety/BlockDialog';
import { MuteToggle } from '../../../_features/safety/MuteToggle';
import { ReportSheet } from '../../../_features/safety/ReportSheet';
import { Button } from '@/ui/components';
import { Flag } from '@/ui/icons';
import { ReportFrame, ReportScreen } from '../../_components/ReportScreen';
import {
  SAMPLE_IDS,
  SAMPLE_ORG,
  sampleApplication,
  sampleProfile,
  samplePool,
} from '../_lib/samples';

export const PREVIEW_SCREENS = [
  'report',
  'report-unreadable',
  'report-sheet',
  'block-seeker',
  'block-host',
  'mute',
  'snapshot-seeker',
  'snapshot-host',
  'candidate-pool',
  'candidate-interested',
  'notifications',
] as const;

export type PreviewScreen = (typeof PREVIEW_SCREENS)[number];

const BASE = '/report/preview';
const RESUME = `/api/v1/me/applications/${SAMPLE_IDS.applicationId}/resume.pdf`;

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ReportFrame home={BASE}>
      <h1 className="text-24 font-extrabold text-ink">{title}</h1>
      {children}
    </ReportFrame>
  );
}

function BlockSeeker() {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  return (
    <Page title={SAMPLE_ORG}>
      <p className="text-16 text-ink-2">
        {blocked ? `You blocked ${SAMPLE_ORG}.` : 'Whitefish, MT'}
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Block host
      </Button>
      <BlockDialog
        by="seeker"
        target={{ type: 'org', id: SAMPLE_IDS.orgId, name: SAMPLE_ORG }}
        offerWithdraw
        open={open}
        onOpenChange={setOpen}
        onBlocked={() => setBlocked(true)}
      />
    </Page>
  );
}

function BlockHost() {
  const [open, setOpen] = useState(false);
  return (
    <Page title="Maya Reyes">
      <p className="text-16 text-ink-2">Applied for Lodge housekeeper</p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Block applicant
      </Button>
      <BlockDialog
        by="host"
        applicationId={SAMPLE_IDS.applicationId}
        firstName="Maya"
        open={open}
        onOpenChange={setOpen}
      />
    </Page>
  );
}

export function W7Preview({ screen }: { screen: PreviewScreen | null }): ReactNode {
  switch (screen) {
    case 'report':
      return <ReportScreen subject={{ type: 'listing', id: SAMPLE_IDS.listingId }} home={BASE} />;
    case 'report-unreadable':
      return <ReportScreen subject={null} home={BASE} />;
    case 'report-sheet':
      return (
        <Page title="Lodge housekeeper">
          <p className="text-16 text-ink-2">{SAMPLE_ORG} · Whitefish, MT</p>
          <ReportSheet
            subject={{ type: 'listing', id: SAMPLE_IDS.listingId }}
            trigger={
              <Button variant="secondary" icon={Flag}>
                Report
              </Button>
            }
          />
        </Page>
      );
    case 'block-seeker':
      return <BlockSeeker />;
    case 'block-host':
      return <BlockHost />;
    case 'mute':
      return (
        <Page title="Following">
          <div className="rounded-xl border border-line bg-surface px-4 py-2">
            <MuteToggle orgId={SAMPLE_IDS.orgId} orgName={SAMPLE_ORG} muted={false} />
          </div>
        </Page>
      );
    case 'snapshot-seeker':
      return (
        <Page title="Your application">
          <ApplicationSnapshotView
            snapshot={sampleApplication()}
            audience="seeker"
            resumeHref={RESUME}
          />
        </Page>
      );
    case 'snapshot-host':
      return (
        <Page title="Application">
          <ApplicationSnapshotView
            snapshot={sampleApplication({
              profile: sampleProfile({
                workAuthorization: { status: 'needs_sponsorship', visaTypes: ['other'] },
              }),
              sponsorshipMismatchAcknowledged: true,
            })}
            audience="host"
            resumeHref={`/api/v1/host/applications/${SAMPLE_IDS.applicationId}/resume.pdf`}
          />
        </Page>
      );
    case 'candidate-pool':
      return (
        <Page title="Candidate">
          <CandidateProfileView card={{ stage: 'pool', card: samplePool() }} />
        </Page>
      );
    case 'candidate-interested':
      return (
        <Page title="Candidate">
          <CandidateProfileView
            card={{ stage: 'interested', card: samplePool(), profile: sampleProfile() }}
            resumeHref={`/api/v1/host/candidates/${SAMPLE_IDS.seekerUserId}/resume.pdf`}
          />
        </Page>
      );
    case 'notifications':
      return (
        <Page title="Notifications">
          <NotificationList />
        </Page>
      );
    default:
      return (
        <Page title="Shared UI preview">
          <ul className="flex flex-col gap-1">
            {PREVIEW_SCREENS.map((name) => (
              <li key={name}>
                <Link
                  href={`${BASE}/${name}`}
                  className="inline-flex min-h-11 items-center text-16 font-semibold text-ink underline"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </Page>
      );
  }
}
