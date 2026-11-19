// CandidateProfileView: a staged candidate for SP5's candidate pages (SP4 spec 7 and 8.3): the
// pool card, or the live profile once revealed.
//
// - pool: PoolCard fields only. First name and last initial, general location, availability,
//   interests and skills. No last name, contact details, resume or work authorization.
// - interested: the live profile (full name, email, phone, the resume and its PDF). Work
//   authorization is never shown here; it appears only in an application snapshot.
//
// Design: the profile header on 03 Hiring 68:27601 (avatar, name, a line under it), the resume
// card 68:28934 and the review step's cards on 02 Seeker 179:16846, with CategoryBadge and the
// CandidateCard pool fields from 00 System 14:1534. Founder approval of all drawn designs:
// #45 comment 6836991077.
import type { ReactNode } from 'react';
import { formatAvailableFrom, type CandidateCard } from '@/lib/profiles';
import { CategoryBadge } from '@/ui/components';
import { joinDot, phoneLabel, placeLabel } from './format';
import {
  InfoCard,
  ProfileIdentity,
  ProfileSections,
  ResumeLink,
  SkillsCard,
} from './ProfileSections';

export type CandidateProfileViewProps = { card: CandidateCard; resumeHref?: string };

export function CandidateProfileView({ card, resumeHref }: CandidateProfileViewProps): ReactNode {
  const pool = card.card;
  const available = (
    <p className="text-16 font-semibold text-ink">{formatAvailableFrom(pool.availabilityDate)}</p>
  );
  const interests =
    pool.categories.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {pool.categories.map((category) => (
          <CategoryBadge key={category} category={category} />
        ))}
      </div>
    ) : null;

  if (card.stage === 'pool') {
    return (
      <div className="flex flex-col gap-4">
        <InfoCard>
          <ProfileIdentity
            name={`${pool.firstName} ${pool.lastInitial}.`}
            line={placeLabel(pool)}
          />
          {interests}
          {available}
        </InfoCard>
        <SkillsCard skills={pool.skills} />
      </div>
    );
  }

  const { profile } = card;
  const contact = joinDot([profile.email, phoneLabel(profile.phone)]);
  return (
    <div className="flex flex-col gap-4">
      <InfoCard>
        <ProfileIdentity
          name={`${profile.firstName} ${profile.lastName}`.trim()}
          line={joinDot([placeLabel(profile), profile.headline])}
        />
        {contact ? <p className="text-16 wrap-anywhere text-ink">{contact}</p> : null}
        {interests}
        {available}
        {profile.bio.trim() !== '' ? (
          <p className="text-16 wrap-anywhere whitespace-pre-line text-ink">{profile.bio}</p>
        ) : null}
        {resumeHref ? <ResumeLink href={resumeHref} /> : null}
      </InfoCard>
      <ProfileSections profile={profile} />
    </div>
  );
}
