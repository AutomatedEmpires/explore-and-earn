'use client';

// The phone photo screens (Figma 43:11830 Camera, 171:23678 Camera blocked): check the photo
// the camera took, or choose one already on the phone when the camera can't be used.
import { useEffect, useRef } from 'react';
import { Button, EmptyState, Img } from '@/ui/components';
import { Lock } from '@/ui/icons';
import type { CameraScreen } from './usePhotos';

export function CameraScreens({
  screen,
  orgName,
  onUse,
  onRetake,
  onLibrary,
  onClose,
}: {
  screen: CameraScreen;
  orgName: string;
  onUse: () => void;
  onRetake: () => void;
  onLibrary: () => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [screen.kind]);

  if (screen.kind === 'blocked') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-16 text-ink-2">{orgName}</p>
        <h1 ref={heading} tabIndex={-1} className="text-24 font-extrabold text-ink outline-none">
          {screen.pick.group}s
        </h1>
        <EmptyState
          icon={Lock}
          titleAs="h2"
          title="We can’t use your camera"
          description="Allow camera access for Explore&Earn in your phone’s settings, or choose photos you already have."
          action={
            <Button variant="secondary" onClick={onLibrary}>
              Choose from your photos
            </Button>
          }
        />
        <Button variant="secondary" size="lg" fullWidth onClick={onRetake}>
          Try the camera again
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onClose}>
          Back to the listing
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-16 text-ink-2">{orgName}</p>
      <div className="flex flex-col gap-2">
        <p className="text-14 font-semibold text-ink">
          {screen.pick.group} · {screen.pick.label}
        </p>
        <h1 ref={heading} tabIndex={-1} className="text-24 font-extrabold text-ink outline-none">
          {screen.pick.label}
        </h1>
        <p className="text-16 text-ink-2">{screen.pick.hint}</p>
      </div>
      <Img
        src={screen.preview}
        alt={`The ${screen.pick.label.toLowerCase()} photo you just took`}
        loading="eager"
        className="aspect-4/3 w-full rounded-xl bg-surface-2 object-cover"
      />
      <Button size="lg" fullWidth onClick={onUse}>
        Use this photo
      </Button>
      <Button variant="secondary" size="lg" fullWidth onClick={onRetake}>
        Retake
      </Button>
    </div>
  );
}
