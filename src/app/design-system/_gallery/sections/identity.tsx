import type { ReactNode } from 'react';
import { Avatar, Img, OrgLogo, type AvatarSize, type OrgLogoSize } from '@/ui/components';
import { img, kettleRidge } from '../samples';
import { Section, Specimen, States } from '../Specimen';

const avatarSizes: { size: AvatarSize; px: number }[] = [
  { size: 'sm', px: 32 },
  { size: 'md', px: 40 },
  { size: 'lg', px: 52 },
  { size: 'xl', px: 60 },
];

const logoSizes: { size: OrgLogoSize; px: number }[] = [
  { size: 'sm', px: 32 },
  { size: 'md', px: 40 },
  { size: 'lg', px: 52 },
  { size: 'xl', px: 64 },
];

/** A strip of cover photo with the identity overlapping its bottom edge, as on cards. */
function OnCover({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl bg-surface shadow-card">
      <div className="relative h-20 bg-surface-2">
        <Img src={img.lake} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute -bottom-7 left-4 flex">{children}</div>
      </div>
      <div className="h-10" />
    </div>
  );
}

export function IdentitySection() {
  return (
    <>
      <Section
        id="avatar"
        title="Avatar"
        description="People are round. Without a photo, or when the seeker turns off “Show my photo to hosts”, the avatar shows initials and the photo is never sent."
      >
        <Specimen title="Photo">
          {() => (
            <States
              items={avatarSizes.map(({ size, px }) => ({
                label: `${size} · ${px} px`,
                node: <Avatar name="Maya Rodriguez" src={img.maya} size={size} />,
              }))}
            />
          )}
        </Specimen>
        <Specimen title="Initials">
          {() => (
            <States
              items={avatarSizes.map(({ size, px }) => ({
                label: `${size} · ${px} px`,
                node: <Avatar name="Maya Rodriguez" size={size} />,
              }))}
            />
          )}
        </Specimen>
        <Specimen
          title="On a cover"
          note="ring adds a surface-colored border where the avatar overlaps a photo."
        >
          {() => (
            <States
              items={[
                {
                  label: 'Photo',
                  wide: true,
                  node: (
                    <OnCover>
                      <Avatar name="Maya Rodriguez" src={img.maya} size="xl" ring />
                    </OnCover>
                  ),
                },
                {
                  label: 'Photo hidden from hosts',
                  wide: true,
                  node: (
                    <OnCover>
                      <Avatar name="Maya Rodriguez" size="xl" ring />
                    </OnCover>
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="org-logo"
        title="OrgLogo"
        description="Organizations are rounded squares; the radius grows with the size. Without a logo, the initials of the name."
      >
        <Specimen title="Logo">
          {() => (
            <States
              items={logoSizes.map(({ size, px }) => ({
                label: `${size} · ${px} px`,
                node: <OrgLogo name={kettleRidge.name} src={kettleRidge.logoSrc} size={size} />,
              }))}
            />
          )}
        </Specimen>
        <Specimen title="Initials">
          {() => (
            <States
              items={logoSizes.map(({ size, px }) => ({
                label: `${size} · ${px} px`,
                node: <OrgLogo name="Hollow Oak Orchards" size={size} />,
              }))}
            />
          )}
        </Specimen>
        <Specimen title="On a cover">
          {() => (
            <OnCover>
              <OrgLogo name={kettleRidge.name} src={kettleRidge.logoSrc} size="lg" ring />
            </OnCover>
          )}
        </Specimen>
      </Section>
    </>
  );
}
