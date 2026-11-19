// The profile as an application or a revealed candidate shows it (SP4 plan Task 35), shared by
// ApplicationSnapshotView and CandidateProfileView. Built from approved frames only:
// - the card: Figma 02 Seeker "Apply · review" 179:16846 (surface, line border, 20 px corners,
//   16 px padding, a bold title, 14 px muted labels over 16 px values);
// - the identity row: the same frame's profile card (avatar, name, a muted line under it);
// - entries: the resume card on 03 Hiring 68:28934 (a semibold first line, plain lines under it).
// Sections follow the resume PDF's order (src/modules/profiles/resume/layout.ts): Experience,
// Education, Skills, Certifications, Languages, Links. Work authorization is never read here.
import type { ReactNode } from 'react';
import { SELF_REPORTED, type ProfileSnapshotV1 } from '@/lib/profiles';
import { cn } from '@/ui/cn';
import { Avatar, Badge, Button } from '@/ui/components';
import { FileText } from '@/ui/icons';
import { dayLabel, joinDot, LANGUAGE_LEVELS, monthRange, webHref } from './format';

/**
 * One card. With a title it is a named region, so screen readers can jump between them.
 * `titleAs="p"` keeps the look but not the heading, for a title the host page already shows as
 * its own heading (the receipt's h1 is the listing title).
 */
export function InfoCard({
  title,
  titleAs: Title = 'h2',
  children,
  className,
}: {
  title?: string;
  titleAs?: 'h2' | 'p';
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}
    >
      {title ? <Title className="text-19 font-bold text-ink">{title}</Title> : null}
      {children}
    </section>
  );
}

/** The avatar (initials; photos need a signed URL the caller doesn't have), name and a line. */
export function ProfileIdentity({ name, line }: { name: string; line?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} size="lg" decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-16 font-semibold wrap-anywhere text-ink">{name}</h2>
        {line ? <p className="text-14 wrap-anywhere text-muted">{line}</p> : null}
      </div>
    </div>
  );
}

/** A label over its value, as the answers card draws them. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-14 font-semibold wrap-anywhere text-muted">{label}</dt>
      <dd className="text-16 wrap-anywhere text-ink">{children}</dd>
    </div>
  );
}

/** "Open resume": the generated PDF that was sent (FD-2), a full-width secondary button. */
export function ResumeLink({ href }: { href: string }) {
  return (
    <Button asChild variant="secondary" size="lg" fullWidth>
      <a href={href}>
        <FileText className="size-5" aria-hidden="true" />
        Open resume
      </a>
    </Button>
  );
}

function Entry({ title, badge, lines }: { title: string; badge?: ReactNode; lines: string[] }) {
  const shown = lines.filter((line) => line.trim() !== '');
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-16 font-semibold wrap-anywhere text-ink">{title}</p>
        {badge}
      </div>
      {shown.map((line, i) => (
        <p key={i} className="text-16 wrap-anywhere whitespace-pre-line text-ink">
          {line}
        </p>
      ))}
    </li>
  );
}

/** Highlighted skills first, in rank order, as the PDF lists them. */
export function orderedSkills(
  skills: readonly { label: string; highlighted: boolean }[],
): { label: string; highlighted: boolean }[] {
  return [...skills.filter((s) => s.highlighted), ...skills.filter((s) => !s.highlighted)];
}

export function SkillsCard({
  skills,
}: {
  skills: readonly { label: string; highlighted: boolean }[];
}) {
  if (skills.length === 0) return null;
  // One comma-separated line, as the Compact PDF lists them, so a wrap never strands a separator.
  return (
    <InfoCard title="Skills">
      <p className="text-16 wrap-anywhere text-ink">
        {orderedSkills(skills)
          .map((skill) => skill.label)
          .join(', ')}
      </p>
    </InfoCard>
  );
}

/** Every resume section the profile has, in the PDF's order. Empty sections are left out. */
export function ProfileSections({ profile }: { profile: ProfileSnapshotV1 }) {
  return (
    <>
      {profile.experience.length > 0 ? (
        <InfoCard title="Experience">
          <ul className="flex flex-col gap-4">
            {profile.experience.map((job, i) => (
              <Entry
                key={i}
                title={`${job.title}, ${job.employer}`}
                lines={[
                  joinDot([monthRange(job.startMonth, job.endMonth, job.isCurrent), job.location]),
                  job.description,
                ]}
              />
            ))}
          </ul>
        </InfoCard>
      ) : null}

      {profile.education.length > 0 ? (
        <InfoCard title="Education">
          <ul className="flex flex-col gap-4">
            {profile.education.map((school, i) => (
              <Entry
                key={i}
                title={school.school}
                lines={[school.program, monthRange(school.startMonth, school.endMonth)]}
              />
            ))}
          </ul>
        </InfoCard>
      ) : null}

      <SkillsCard skills={profile.skills} />

      {profile.certifications.length > 0 ? (
        <InfoCard title="Certifications">
          <ul className="flex flex-col gap-4">
            {profile.certifications.map((cert, i) => (
              <Entry
                key={i}
                title={cert.name}
                // Every certification says so, everywhere (spec 7 and 10). Never "verified".
                badge={<Badge>{SELF_REPORTED}</Badge>}
                lines={[
                  joinDot([
                    cert.issuer,
                    cert.issuedOn ? `Issued ${dayLabel(cert.issuedOn)}` : null,
                    cert.expiresOn ? `Expires ${dayLabel(cert.expiresOn)}` : null,
                  ]),
                ]}
              />
            ))}
          </ul>
        </InfoCard>
      ) : null}

      {profile.languages.length > 0 ? (
        <InfoCard title="Languages">
          <ul className="flex flex-col gap-1 text-16 text-ink">
            {profile.languages.map((l, i) => (
              <li key={i}>{joinDot([l.language, LANGUAGE_LEVELS[l.level]])}</li>
            ))}
          </ul>
        </InfoCard>
      ) : null}

      {profile.portfolioLinks.length > 0 ? (
        <InfoCard title="Links">
          <ul className="flex flex-col gap-1 text-16 text-ink">
            {profile.portfolioLinks.map((link, i) => {
              const href = webHref(link.url);
              return (
                <li key={i} className="flex flex-col">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="inline-flex min-h-11 w-fit items-center font-semibold wrap-anywhere text-ink underline underline-offset-2"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <span className="font-semibold wrap-anywhere">{link.label}</span>
                  )}
                  <span className="text-14 wrap-anywhere text-muted">{link.url}</span>
                </li>
              );
            })}
          </ul>
        </InfoCard>
      ) : null}
    </>
  );
}
