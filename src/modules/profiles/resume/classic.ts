// The Classic@1 template: single column, name 20 pt, body 11 pt (SP4 spec 8.8).
// Templates are only ever added, never edited. A change ships as classic@2.
import type { ProfileSnapshotV1 } from '@/lib/profiles';
import { drawResume, type ResumeDoc, type TemplateStyle } from './layout';

const style = {
  id: 'classic@1',
  nameSize: 20,
  bodySize: 11,
  sectionGap: 14,
  skills: 'list',
} as const satisfies TemplateStyle;

export const classicTemplate = {
  ...style,
  draw(doc: ResumeDoc, snapshot: ProfileSnapshotV1): void {
    drawResume(doc, snapshot, style);
  },
};
