import type { Metadata } from 'next';
import { GalleryShell } from '../_gallery/GalleryShell';
import { topbarOptionsPath } from '../_gallery/routes';
import { PageIntro } from '../_gallery/Specimen';
import { TopBarOptions } from '../_reference/TopBarOptions';

export const metadata: Metadata = { title: 'Top bar options' };

export default function TopBarOptionsPage() {
  return (
    <GalleryShell current={topbarOptionsPath}>
      <PageIntro title="Top bar options">
        <p>
          The product spec leaves the top bar open (section 15.1). Here are the three options side
          by side, for a seeker and a host, at phone width in light and dark. Every button works;
          the menu in option C opens. The shells follow the option chosen.
        </p>
      </PageIntro>
      <div className="pt-10">
        <TopBarOptions />
      </div>
    </GalleryShell>
  );
}
