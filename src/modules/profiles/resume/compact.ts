// The Compact@1 template: single column, body 10 pt, tighter spacing, skills on one line
// (SP4 spec 8.8). Templates are only ever added, never edited. A change ships as compact@2.
import type { ProfileSnapshotV1 } from '@/lib/profiles';
import { drawResume, type ResumeDoc, type TemplateStyle } from './layout';

const style = {
  id: 'compact@1',
  nameSize: 16,
  bodySize: 10,
  sectionGap: 8,
  skills: 'comma',
} as const satisfies TemplateStyle;

export const compactTemplate = {
  ...style,
  draw(doc: ResumeDoc, snapshot: ProfileSnapshotV1): void {
    drawResume(doc, snapshot, style);
  },
};
