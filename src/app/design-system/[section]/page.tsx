import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';
import { GalleryShell } from '../_gallery/GalleryShell';
import { findSection, sectionPath, type SectionSlug } from '../_gallery/routes';
import { ButtonsSection } from '../_gallery/sections/buttons';
import { CardsSection } from '../_gallery/sections/cards';
import { ChartsSection } from '../_gallery/sections/charts';
import { ChipsSection } from '../_gallery/sections/chips';
import { FeedbackSection } from '../_gallery/sections/feedback';
import { FormsSection } from '../_gallery/sections/forms';
import { FoundationsSection } from '../_gallery/sections/foundations';
import { IdentitySection } from '../_gallery/sections/identity';
import { NavigationSection } from '../_gallery/sections/navigation';
import { OverlaysSection } from '../_gallery/sections/overlays';
import { PageIntro } from '../_gallery/Specimen';

const content: Record<SectionSlug, ComponentType> = {
  foundations: FoundationsSection,
  buttons: ButtonsSection,
  chips: ChipsSection,
  identity: IdentitySection,
  cards: CardsSection,
  forms: FormsSection,
  navigation: NavigationSection,
  overlays: OverlaysSection,
  feedback: FeedbackSection,
  charts: ChartsSection,
};

export async function generateMetadata({
  params,
}: PageProps<'/design-system/[section]'>): Promise<Metadata> {
  const { section } = await params;
  return { title: findSection(section)?.title ?? 'Not found' };
}

export default async function GallerySectionPage({
  params,
}: PageProps<'/design-system/[section]'>) {
  const section = findSection((await params).section);
  if (!section) notFound();
  const Content = content[section.slug];
  return (
    <GalleryShell current={sectionPath(section.slug)}>
      <PageIntro title={section.title}>
        <p>{section.summary}</p>
      </PageIntro>
      <Content />
    </GalleryShell>
  );
}
