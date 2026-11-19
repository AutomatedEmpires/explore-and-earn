// Shared resume layout (SP4 spec 8.8). Section order is fixed. A template change after the
// goldens are committed ships as a new version (classic@2), never by editing classic@1.
import type PDFDocument from 'pdfkit';
import type { ProfileSnapshotV1, ResumeTemplate } from '@/lib/profiles';

export type ResumeDoc = InstanceType<typeof PDFDocument>;

export type TemplateStyle = {
  id: ResumeTemplate;
  /** Points. Classic@1 is 20. */
  nameSize: number;
  /** Points. Classic@1 is 11, Compact@1 is 10. */
  bodySize: number;
  /** Points of space before a section title. Compact uses less. */
  sectionGap: number;
  /** Compact puts every skill on one comma-separated line. */
  skills: 'list' | 'comma';
};

type Block = PDFKit.PDFStructureElement;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `2024-05` → `May 2024`. An unreadable value is returned unchanged. */
function monthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : ym;
}

/** `2027-06-01` → `Expires Jun 1, 2027`. Never the word "verified". */
function expiresLabel(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  const date = Number(day);
  return name && year && date ? `Expires ${name} ${date}, ${year}` : `Expires ${iso}`;
}

/** `email · phone · city, region`, leaving out a phone or region that is absent. */
function contactLine(snapshot: ProfileSnapshotV1): string {
  const place = snapshot.region ? `${snapshot.city}, ${snapshot.region}` : snapshot.city;
  return [snapshot.email, snapshot.phone, place]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(' · ');
}

/** Highlighted skills stay in rank order, ahead of the rest. */
function orderedSkills(skills: ProfileSnapshotV1['skills']): ProfileSnapshotV1['skills'] {
  return [
    ...skills.filter((skill) => skill.highlighted),
    ...skills.filter((skill) => !skill.highlighted),
  ];
}

function textBlock(
  doc: ResumeDoc,
  tag: 'H1' | 'H2' | 'P',
  font: 'Figtree' | 'Figtree-SemiBold',
  size: number,
  text: string,
  gapBefore: number,
): Block {
  return doc.struct(tag, {}, () => {
    if (gapBefore > 0) doc.y += gapBefore;
    doc.font(font).fontSize(size).text(text);
  });
}

function sectionTitle(doc: ResumeDoc, style: TemplateStyle, title: string): Block {
  return textBlock(doc, 'H2', 'Figtree-SemiBold', style.bodySize, title, style.sectionGap);
}

/**
 * Draws the resume into `doc`. The photo, work authorization, preferences and the word
 * "verified" are never written: those fields are not read here.
 */
export function drawResume(doc: ResumeDoc, snapshot: ProfileSnapshotV1, style: TemplateStyle): void {
  const blocks: Block[] = [
    textBlock(
      doc,
      'H1',
      'Figtree-SemiBold',
      style.nameSize,
      `${snapshot.firstName} ${snapshot.lastName}`,
      0,
    ),
    textBlock(doc, 'P', 'Figtree', style.bodySize, contactLine(snapshot), 8),
  ];
  if (snapshot.headline.trim() !== '') {
    blocks.push(textBlock(doc, 'P', 'Figtree', style.bodySize, snapshot.headline, 10));
  }
  if (snapshot.bio.trim() !== '') {
    blocks.push(textBlock(doc, 'P', 'Figtree', style.bodySize, snapshot.bio, 6));
  }

  if (snapshot.experience.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Experience'));
    blocks.push(
      doc.struct(
        'L',
        {},
        snapshot.experience.map((job) =>
          doc.struct('LI', {}, () => {
            const end = job.isCurrent ? 'Present' : job.endMonth ? monthLabel(job.endMonth) : '';
            doc.font('Figtree-SemiBold').fontSize(style.bodySize).text(`${job.title}, ${job.employer}`);
            doc
              .font('Figtree')
              .fontSize(style.bodySize)
              .text(`${monthLabel(job.startMonth)} - ${end} · ${job.location}`);
            if (job.description.trim() !== '') doc.text(job.description);
            doc.moveDown(0.35);
          }),
        ),
      ),
    );
  }

  if (snapshot.education.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Education'));
    blocks.push(
      doc.struct(
        'L',
        {},
        snapshot.education.map((school) =>
          doc.struct('LI', {}, () => {
            const when = [school.startMonth, school.endMonth]
              .filter((month): month is string => month !== null && month !== '')
              .map(monthLabel)
              .join(' - ');
            doc.font('Figtree-SemiBold').fontSize(style.bodySize).text(school.school);
            doc.font('Figtree').fontSize(style.bodySize).text(school.program);
            if (when !== '') doc.text(when);
            doc.moveDown(0.35);
          }),
        ),
      ),
    );
  }

  const skills = orderedSkills(snapshot.skills);
  if (skills.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Skills'));
    if (style.skills === 'comma') {
      blocks.push(
        textBlock(doc, 'P', 'Figtree', style.bodySize, skills.map((skill) => skill.label).join(', '), 0),
      );
    } else {
      blocks.push(
        doc.struct(
          'L',
          {},
          skills.map((skill) =>
            doc.struct('LI', {}, () => {
              doc.font('Figtree').fontSize(style.bodySize).text(skill.label);
            }),
          ),
        ),
      );
    }
  }

  if (snapshot.certifications.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Certifications'));
    blocks.push(
      doc.struct(
        'L',
        {},
        snapshot.certifications.map((cert) =>
          doc.struct('LI', {}, () => {
            const expires = cert.expiresOn ? `. ${expiresLabel(cert.expiresOn)}` : '';
            doc
              .font('Figtree')
              .fontSize(style.bodySize)
              .text(`${cert.name}, ${cert.issuer}. Self-reported${expires}`);
          }),
        ),
      ),
    );
  }

  if (snapshot.languages.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Languages'));
    blocks.push(
      doc.struct(
        'L',
        {},
        snapshot.languages.map((language) =>
          doc.struct('LI', {}, () => {
            doc.font('Figtree').fontSize(style.bodySize).text(`${language.language} (${language.level})`);
          }),
        ),
      ),
    );
  }

  if (snapshot.portfolioLinks.length > 0) {
    blocks.push(sectionTitle(doc, style, 'Links'));
    blocks.push(
      doc.struct(
        'L',
        {},
        snapshot.portfolioLinks.map((link) =>
          doc.struct('LI', {}, () => {
            doc.font('Figtree').fontSize(style.bodySize).text(`${link.label}: ${link.url}`);
          }),
        ),
      ),
    );
  }

  doc.addStructure(doc.struct('Document', {}, blocks));
}
