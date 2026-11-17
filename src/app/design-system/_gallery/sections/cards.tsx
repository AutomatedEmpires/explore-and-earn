'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  CandidateCard,
  Card,
  CardSkeleton,
  CardTitleLink,
  Chip,
  JobCard,
  OrgLogo,
  type CandidateCardProps,
  type JobCardProps,
} from '@/ui/components';
import {
  ana,
  deckhand,
  guestSupport,
  housekeeper,
  maya,
  orchard,
  type SampleJob,
} from '../samples';
import { Section, Specimen } from '../Specimen';

const noop = () => {};

/** Sample records carry an id for lists; cards don't take one. */
function strip<T extends { id: string }>({ id: _id, ...rest }: T): Omit<T, 'id'> {
  return rest;
}

function Job({ job, ...rest }: { job: SampleJob } & Partial<JobCardProps>) {
  const [saved, setSaved] = useState(job.saved ?? false);
  const { id: _id, ...props } = job;
  return (
    <JobCard
      {...props}
      saved={saved}
      onSave={() => setSaved((s) => !s)}
      onOpenChip={noop}
      onApply={noop}
      onSkip={noop}
      className="max-w-sm"
      {...rest}
    />
  );
}

function Candidate(props: CandidateCardProps) {
  return <CandidateCard {...props} onOpenChip={noop} className="max-w-sm" />;
}

/** The template itself, each slot labelled with its name. */
function Anatomy() {
  const slot = (name: string) => (
    <span className="rounded-sm bg-surface-2 px-1.5 font-mono text-13 text-ink-2">{name}</span>
  );
  return (
    <Card
      className="max-w-sm"
      cover={<div className="flex size-full items-center justify-center">{slot('cover')}</div>}
      coverBadge={<Badge tone="surface">coverBadge</Badge>}
      coverAction={<Badge tone="inverse">coverAction</Badge>}
      identity={<OrgLogo name="identity" size="lg" ring />}
      title={<CardTitleLink href="#anatomy">title</CardTitleLink>}
      subtitle={slot('subtitle')}
      info={slot('info')}
      chips={[
        <Chip key="1" label="chips[0]" value="Value" />,
        <Chip key="2" label="chips[1]" value="Value" />,
        <Chip key="3" label="chips[2]" value="Value" />,
      ]}
      actions={
        <Button size="lg" fullWidth variant="secondary">
          actions
        </Button>
      }
    />
  );
}

export function CardsSection() {
  return (
    <>
      <Section
        id="template"
        title="The shared card"
        description="One template, filled differently for jobs and for candidates (product spec section 4). Exactly three chips. Tapping the card body opens the detail page; chips and buttons sit above that link."
      >
        <Specimen title="Anatomy">{() => <Anatomy />}</Specimen>
      </Section>

      <Section
        id="job-card"
        title="JobCard"
        description="What a seeker sees. The host logo is a rounded square; Housing and Meals read “Provided” in green whenever offered, paid or free."
      >
        <Specimen title="Housing and meals provided">{() => <Job job={housekeeper} />}</Specimen>
        <Specimen
          title="Boosted and saved"
          note="Boosted is a neutral badge with a spark, never gold, so it can’t be mistaken for Seasonal amber."
        >
          {() => <Job job={{ ...deckhand, saved: true }} />}
        </Specimen>
        <Specimen title="Partly provided" note="A pay range and no meals.">
          {() => <Job job={orchard} />}
        </Specimen>
        <Specimen
          title="Nothing provided, no cover photo"
          note="Without a photo the cover is a quiet neutral; without a logo, initials."
        >
          {() => <Job job={guestSupport} />}
        </Specimen>
        <Specimen
          title="No cover photo, cover collapsed"
          note="hideCover drops the cover, its badges and the logo for a job without a photo."
        >
          {() => <Job job={guestSupport} hideCover />}
        </Specimen>
        <Specimen
          title="Freshness and pay estimate"
          note="The freshness line sits under the dates; the estimate under the chips, with a 44 px “How we work this out”."
        >
          {() => (
            <Job
              job={housekeeper}
              freshness="Confirmed active 2 days ago"
              payEstimate={{
                line: 'About $676 a week after housing and meals',
                basis:
                  'Before taxes. Based on 40 hours a week at $19 an hour, less $84 a week for housing and meals.',
                onExplain: noop,
              }}
            />
          )}
        </Specimen>
        <Specimen title="In Swipe" note="An info button on the photo also opens the listing.">
          {() => <Job job={housekeeper} onInfo={noop} />}
        </Specimen>
        <Specimen title="Without actions" note="On the host page and in lists.">
          {() => <Job job={deckhand} hideActions />}
        </Specimen>
      </Section>

      <Section
        id="candidate-card"
        title="CandidateCard"
        description="What a host sees: the same template with Resume, Fit and Skills. The avatar is round, and shows only when the seeker allows it."
      >
        <Specimen title="Applicant">
          {() => <Candidate {...strip(maya)} onPass={noop} onInterview={noop} onShortlist={noop} />}
        </Specimen>
        <Specimen
          title="Applicant, photo hidden"
          note="“Show my photo to hosts” is off, so the avatar shows initials."
        >
          {() => (
            <Candidate
              {...strip(ana)}
              shortlisted
              onPass={noop}
              onInterview={noop}
              onShortlist={noop}
            />
          )}
        </Specimen>
        <Specimen
          title="Candidate pool"
          note="Before the seeker applies or answers Interested: first name and last initial only."
        >
          {() => (
            <Candidate
              {...strip(maya)}
              variant="pool"
              onHide={noop}
              onInvite={noop}
              onSave={noop}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="loading"
        title="Loading"
        description="The card’s skeleton, announced once as “Loading”."
      >
        <Specimen title="CardSkeleton">{() => <CardSkeleton className="max-w-sm" />}</Specimen>
      </Section>
    </>
  );
}
