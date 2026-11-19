// ApplicationSnapshotView: the frozen application as the seeker's receipt and SP5's applicant
// page show it (SP4 spec 7; plan Task 35). Renders only from the snapshot, never a live
// listing, so a closed or removed listing still shows (Review Focus 5).
//
// Design: the approved flow B review step, Figma 02 Seeker "Apply · review" 179:16846 (390),
// 179:16968 (768) and 179:17077 (1440): the job card, the profile card with the work line, and
// the answers card. The resume sections use the resume card on 03 Hiring 68:28934. Lead
// approval of flows B and D: #45 comment 6810708880; founder approval of all drawn designs:
// #45 comment 6836991077.
//
// Minimum data: a host sees work authorization as "authorized" or "needs sponsorship" only.
import type { ReactNode } from 'react';
import type { ApplicationSnapshotV1 } from '@/lib/applications';
import {
  Fact,
  InfoCard,
  ProfileIdentity,
  ProfileSections,
  ResumeLink,
} from '../profiles/ProfileSections';
import {
  dayRange,
  joinDot,
  phoneLabel,
  placeLabel,
  workAuthorizationLine,
} from '../profiles/format';

export type ApplicationSnapshotViewProps = {
  snapshot: ApplicationSnapshotV1;
  audience: 'seeker' | 'host';
  resumeHref: string;
};

type Answer = ApplicationSnapshotV1['answers'][number];

function answerText(answer: Answer): string {
  const { value } = answer;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'No answer';
  if (value === null || value.trim() === '') return 'No answer';
  return value;
}

export function ApplicationSnapshotView({
  snapshot,
  audience,
  resumeHref,
}: ApplicationSnapshotViewProps): ReactNode {
  const { listing, profile, answers } = snapshot;
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const dates = dayRange(listing.startDate, listing.endDate);
  const contact = joinDot([profile.email, phoneLabel(profile.phone)]);
  const work = profile.workAuthorization
    ? workAuthorizationLine(profile.workAuthorization, audience)
    : null;
  const acknowledged = snapshot.sponsorshipMismatchAcknowledged
    ? audience === 'seeker'
      ? "You confirmed you'd apply without visa sponsorship."
      : `${profile.firstName} confirmed they'd apply without visa sponsorship.`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <InfoCard title={listing.title}>
        <p className="text-14 wrap-anywhere text-muted">
          {joinDot([listing.orgName, listing.locationLabel])}
        </p>
        {dates ? <p className="text-16 text-ink">{dates}</p> : null}
      </InfoCard>

      <InfoCard>
        <ProfileIdentity name={name} line={joinDot([placeLabel(profile), profile.headline])} />
        {contact ? <p className="text-16 wrap-anywhere text-ink">{contact}</p> : null}
        {profile.bio.trim() !== '' ? (
          <p className="text-16 wrap-anywhere whitespace-pre-line text-ink">{profile.bio}</p>
        ) : null}
        {work ? (
          <dl>
            <Fact label="Work authorization">{work}</Fact>
          </dl>
        ) : null}
        {acknowledged ? <p className="text-16 text-ink">{acknowledged}</p> : null}
        <ResumeLink href={resumeHref} />
      </InfoCard>

      <ProfileSections profile={profile} />

      {answers.length > 0 ? (
        <InfoCard title={audience === 'seeker' ? 'Your answers' : 'Answers'}>
          <dl className="flex flex-col gap-3">
            {answers.map((answer) => (
              <Fact key={answer.questionId} label={answer.prompt}>
                {answerText(answer)}
              </Fact>
            ))}
          </dl>
        </InfoCard>
      ) : null}
    </div>
  );
}
