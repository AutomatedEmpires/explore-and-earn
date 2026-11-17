'use client';

// Photo picking and uploading for the builder. On a phone an empty slot opens the phone's own
// camera (an <input capture>: the site's Permissions-Policy turns off in-page camera access),
// then the approved confirm screen ("Use this photo" / "Retake"). If the camera is closed
// without a photo, the builder offers the host's own photos instead. Elsewhere a slot opens
// the file picker and uploads at once. A failed upload keeps the file so one tap retries it.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ApiError, photoProblem, uploadPhoto, type PhotoKind } from '../_lib/api';
import { getPath, strings, type Json } from '../_lib/paths';
import type { SlotState } from './PhotoSlot';

export type PhotoPick = {
  /** Draft path of the media id, or `photos.galleryMediaIds` to add to the gallery. */
  path: string;
  label: string;
  /** "Housing photo", "Meal photo", "Listing photo". */
  group: string;
  kind: PhotoKind;
  hint: string;
};

export type CameraScreen =
  | { kind: 'confirm'; pick: PhotoPick; file: File; preview: string }
  | { kind: 'blocked'; pick: PhotoPick };

const GALLERY = 'photos.galleryMediaIds';

type Transient =
  { kind: 'uploading'; preview: string | null } | { kind: 'failed'; message: string };

export function usePhotos(opts: {
  phone: boolean;
  draft: Json;
  setValue: (path: string, value: unknown) => void;
}): {
  inputs: ReactNode;
  camera: CameraScreen | null;
  pick: (p: PhotoPick) => void;
  slot: (path: string) => SlotState;
  /** Paths whose upload failed. */
  failed: string[];
  useThisPhoto: () => void;
  retake: () => void;
  chooseFromLibrary: () => void;
  closeCamera: () => void;
} {
  const { phone, setValue } = opts;
  const draftRef = useRef(opts.draft);
  useEffect(() => {
    draftRef.current = opts.draft;
  }, [opts.draft]);

  const capture = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const target = useRef<PhotoPick | null>(null);
  const files = useRef(new Map<string, { file: File; pick: PhotoPick }>());
  const [transient, setTransient] = useState<Record<string, Transient>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [camera, setCamera] = useState<CameraScreen | null>(null);

  const upload = useCallback(
    async (pick: PhotoPick, file: File) => {
      const key = pick.path;
      const problem = photoProblem(file);
      if (problem) {
        setTransient((t) => ({ ...t, [key]: { kind: 'failed', message: problem } }));
        return;
      }
      files.current.set(key, { file, pick });
      const preview = URL.createObjectURL(file);
      setTransient((t) => ({ ...t, [key]: { kind: 'uploading', preview } }));
      try {
        const mediaId = await uploadPhoto(file, pick.kind);
        if (key === GALLERY) {
          const gallery = strings(getPath(draftRef.current, GALLERY));
          setValue(GALLERY, [...gallery, mediaId]);
          setPreviews((p) => ({ ...p, [`${GALLERY}.${mediaId}`]: preview }));
        } else {
          setValue(key, mediaId);
          setPreviews((p) => ({ ...p, [key]: preview }));
        }
        files.current.delete(key);
        setTransient((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== key)));
      } catch (err) {
        const message =
          err instanceof ApiError && err.offline
            ? 'You are offline. Try again when you are back.'
            : "The photo didn't upload. Try again.";
        setTransient((t) => ({ ...t, [key]: { kind: 'failed', message } }));
      }
    },
    [setValue],
  );

  const pick = useCallback(
    (p: PhotoPick) => {
      const failed = files.current.get(p.path);
      if (transient[p.path]?.kind === 'failed' && failed) {
        void upload(failed.pick, failed.file);
        return;
      }
      target.current = p;
      (phone ? capture : library).current?.click();
    },
    [phone, transient, upload],
  );

  const onChosen = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const chosen = Array.from(input.files ?? []);
      input.value = '';
      const p = target.current;
      if (!p || chosen.length === 0) return;
      const first = chosen[0];
      if (!first) return;
      if (phone) {
        setCamera({ kind: 'confirm', pick: p, file: first, preview: URL.createObjectURL(first) });
        return;
      }
      if (p.path === GALLERY) {
        // Several photos at once go into the gallery one after another.
        void chosen.reduce((prev, file) => prev.then(() => upload(p, file)), Promise.resolve());
      } else {
        void upload(p, first);
      }
    },
    [phone, upload],
  );

  // The camera closed without a photo: offer the host's own photos.
  useEffect(() => {
    const input = capture.current;
    if (!input) return;
    const cancelled = () => {
      if (target.current) setCamera({ kind: 'blocked', pick: target.current });
    };
    input.addEventListener('cancel', cancelled);
    return () => input.removeEventListener('cancel', cancelled);
  }, []);

  const slot = useCallback(
    (path: string): SlotState => {
      const t = transient[path];
      if (t) return t;
      const mediaId = getPath(opts.draft, path);
      if (typeof mediaId === 'string' && mediaId) {
        const preview = previews[path] ?? previews[galleryPreviewKey(mediaId)] ?? null;
        return { kind: 'filled', mediaId, preview };
      }
      return { kind: 'empty' };
    },
    [opts.draft, previews, transient],
  );

  const inputs = (
    <>
      <input
        ref={capture}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-camera-input"
        onChange={onChosen}
      />
      <input
        ref={library}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple={!phone}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-library-input"
        onChange={onChosen}
      />
    </>
  );

  return {
    inputs,
    camera,
    pick,
    slot,
    failed: Object.entries(transient)
      .filter(([, t]) => t.kind === 'failed')
      .map(([path]) => path),
    useThisPhoto: () => {
      if (camera?.kind !== 'confirm') return;
      void upload(camera.pick, camera.file);
      setCamera(null);
    },
    retake: () => {
      if (camera) target.current = camera.pick;
      capture.current?.click();
    },
    chooseFromLibrary: () => {
      if (camera) target.current = camera.pick;
      library.current?.click();
    },
    closeCamera: () => setCamera(null),
  };
}

/** The preview a gallery photo uploaded in this visit can show. */
export function galleryPreviewKey(mediaId: string): string {
  return `${GALLERY}.${mediaId}`;
}
