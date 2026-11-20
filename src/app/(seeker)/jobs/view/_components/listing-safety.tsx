'use client';

// Report, Block and Mute at the end of the listing (issue 224, follow-up to #145), for a
// signed-in seeker. They are the W7 parts exactly as #145 built them, with #145's copy:
// - Report opens the ReportSheet for this job (subject `listing`), from the same ghost button the
//   guest's link uses. Share stays next to it, so the row reads as the guest's row.
// - Block host opens the seeker BlockDialog for the org, with "Also withdraw my applications to
//   this host" off. Once the block goes through, the button goes, "You blocked [host]." is
//   announced in its place (as in the approved W7 preview), and focus moves to Report.
// - The MuteToggle switch row, in the settings card the approved W7 preview mounts it in.
// A guest gets none of this: the page keeps the plain link to /report, which signs them in
// first and comes back to the same report, so nothing typed is lost to a sign-in.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BlockDialog } from '@/app/_features/safety/BlockDialog';
import { MuteToggle } from '@/app/_features/safety/MuteToggle';
import { ReportSheet } from '@/app/_features/safety/ReportSheet';
import { Button } from '@/ui/components';
import { cn } from '@/ui/cn';
import { Flag } from '@/ui/icons';

/** The listing's host as the signed-in seeker sees it. */
export type ListingSafetyHost = { orgId: string; orgName: string; muted: boolean };

export function ListingSafety({
  listingId,
  host,
  share,
}: {
  listingId: string;
  host: ListingSafetyHost;
  /** The page's Share button, which follows Report as on the guest's row. */
  share: ReactNode;
}) {
  const report = useRef<HTMLButtonElement>(null);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // The Block host button is gone once the block went through; its neighbour takes focus.
  useEffect(() => {
    if (blocked) report.current?.focus();
  }, [blocked]);

  return (
    <>
      <div className="flex flex-col">
        <div className="flex flex-wrap gap-2">
          <ReportSheet
            subject={{ type: 'listing', id: listingId }}
            trigger={
              <Button ref={report} variant="ghost" icon={Flag}>
                Report
              </Button>
            }
          />
          {share}
          {blocked ? null : (
            <Button variant="ghost" onClick={() => setBlocking(true)}>
              Block host
            </Button>
          )}
        </div>
        <p role="status" className={cn(blocked && 'pt-2 text-16 text-ink-2')}>
          {blocked ? `You blocked ${host.orgName}.` : null}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-surface px-4 py-2">
        <MuteToggle orgId={host.orgId} orgName={host.orgName} muted={host.muted} />
      </div>
      <BlockDialog
        by="seeker"
        target={{ type: 'org', id: host.orgId, name: host.orgName }}
        offerWithdraw
        open={blocking}
        onOpenChange={setBlocking}
        onBlocked={() => setBlocked(true)}
      />
    </>
  );
}
