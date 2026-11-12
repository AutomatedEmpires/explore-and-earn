import type { MouseEvent } from 'react';
import type { Category } from '@/ui/categories';
import {
  Bookmark,
  CalendarDays,
  Clock,
  EyeOff,
  FileText,
  ListChecks,
  Send,
  Star,
  Target,
  X,
} from '@/ui/icons';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card, CardTitleLink } from './Card';
import { CategoryListBadge } from './CategoryBadge';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { Img } from './Img';

export type CandidateCardChip = 'resume' | 'fit' | 'skills';

type CandidateBase = {
  /** The applicant's frozen application, or the limited pool view. */
  href: string;
  firstName: string;
  lastName: string;
  /** General location only, e.g. "Bend, OR". */
  location: string;
  avatarSrc?: string | null;
  /** "Show my photo to hosts". When false the avatar shows initials and the photo is never sent. */
  showPhoto: boolean;
  cover?: { src: string; alt: string; srcSet?: string } | null;
  interests: readonly Category[];
  /** A real date, formatted for display. */
  availableFrom?: string;
  availableThrough?: string;
  /** Second line of the Resume chip, e.g. "3 seasons". */
  resume: { summary: string };
  fit: { score: number; label?: string };
  skills: { count: number };
  onOpenChip?: (chip: CandidateCardChip) => void;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  titleAs?: 'h2' | 'h3';
  className?: string;
};

export type ApplicantCardProps = CandidateBase & {
  variant: 'applicant';
  appliedDaysAgo: number;
  appliedFor: string;
  shortlisted?: boolean;
  onPass?: () => void;
  onInterview?: () => void;
  onShortlist?: () => void;
};

export type PoolCandidateCardProps = CandidateBase & {
  variant: 'pool';
  saved?: boolean;
  onHide?: () => void;
  onInvite?: () => void;
  onSave?: () => void;
};

export type CandidateCardProps = ApplicantCardProps | PoolCandidateCardProps;

function appliedAgo(days: number): string {
  if (days <= 0) return 'Applied today';
  return `Applied ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * The candidate card a host sees: the shared Card with the seeker's fields
 * (product spec section 4). Pool cards show first name and last initial only.
 */
export function CandidateCard(props: CandidateCardProps) {
  const {
    href,
    firstName,
    lastName,
    location,
    avatarSrc,
    showPhoto,
    cover,
    interests,
    availableFrom,
    availableThrough,
    resume,
    fit,
    skills,
    onOpenChip,
    onOpen,
    titleAs,
    className,
  } = props;
  const name =
    props.variant === 'pool' ? `${firstName} ${lastName.slice(0, 1)}.` : `${firstName} ${lastName}`;
  const open = (chip: CandidateCardChip) => (onOpenChip ? () => onOpenChip(chip) : undefined);

  return (
    <Card
      className={className}
      titleAs={titleAs}
      coverSize="md"
      cover={
        cover ? (
          <Img
            src={cover.src}
            srcSet={cover.srcSet}
            alt={cover.alt}
            className="size-full object-cover"
          />
        ) : null
      }
      coverBadge={<CategoryListBadge categories={interests} />}
      coverAction={
        props.variant === 'applicant' ? (
          <Badge tone="inverse" icon={Clock}>
            {appliedAgo(props.appliedDaysAgo)}
          </Badge>
        ) : null
      }
      identity={<Avatar name={name} src={showPhoto ? avatarSrc : null} size="xl" ring />}
      title={
        <CardTitleLink href={href} onClick={onOpen}>
          {name}
        </CardTitleLink>
      }
      subtitle={
        <>
          <span>{location}</span>
          {props.variant === 'applicant' ? (
            <span className="text-muted">· Applied for {props.appliedFor}</span>
          ) : null}
        </>
      }
      info={
        availableFrom ? (
          <>
            <CalendarDays className="size-3.75" />
            <span className="font-semibold text-ink">Available {availableFrom}</span>
            {availableThrough ? <span>· Through {availableThrough}</span> : null}
          </>
        ) : null
      }
      chips={[
        <Chip
          key="resume"
          label="Resume"
          icon={FileText}
          value={resume.summary}
          onOpen={open('resume')}
        />,
        <Chip
          key="fit"
          label="Fit"
          icon={Target}
          value={
            <>
              {fit.score}
              {fit.label ? <span className="font-semibold text-muted"> · {fit.label}</span> : null}
            </>
          }
          onOpen={open('fit')}
        />,
        <Chip
          key="skills"
          label="Skills"
          icon={ListChecks}
          value={`${skills.count} listed`}
          onOpen={open('skills')}
        />,
      ]}
      actions={
        props.variant === 'applicant' ? (
          <>
            <IconButton icon={X} label="Pass" variant="outline" size="lg" onClick={props.onPass} />
            <Button size="lg" icon={CalendarDays} className="flex-1" onClick={props.onInterview}>
              Interview
            </Button>
            <IconButton
              icon={Star}
              label="Shortlist"
              variant="outline"
              size="lg"
              aria-pressed={props.shortlisted ?? false}
              onClick={props.onShortlist}
            />
          </>
        ) : (
          <>
            <IconButton
              icon={EyeOff}
              label="Hide"
              variant="outline"
              size="lg"
              onClick={props.onHide}
            />
            <Button size="lg" icon={Send} className="flex-1" onClick={props.onInvite}>
              Invite
            </Button>
            <IconButton
              icon={Bookmark}
              label="Save"
              variant="outline"
              size="lg"
              aria-pressed={props.saved ?? false}
              onClick={props.onSave}
            />
          </>
        )
      }
    />
  );
}
