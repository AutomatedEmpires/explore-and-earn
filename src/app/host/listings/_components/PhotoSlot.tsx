'use client';

// PhotoSlot (Figma 00 System 155:5143; #152 H-7): an empty dashed tile with the slot's icon and
// name, the photo with its name, or a failed upload with "Tap to try again".
import { useEffect, useState } from 'react';
import { cn } from '@/ui/cn';
import { Badge, Img } from '@/ui/components';
import { LoaderCircle, TriangleAlert, type IconComponent } from '@/ui/icons';
import { api } from '../_lib/api';

export type SlotState =
  | { kind: 'empty' }
  | { kind: 'uploading'; preview: string | null }
  | { kind: 'failed'; message: string }
  | { kind: 'filled'; mediaId: string; preview: string | null };

/** A URL for an uploaded photo; null while it is still being checked or can't be read. */
export function useMediaUrl(mediaId: string | null): string | null {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!mediaId) return;
    let live = true;
    api
      .mediaUrl(mediaId)
      .then((r) => live && setUrl({ id: mediaId, url: r.url }))
      .catch(() => live && setUrl({ id: mediaId, url: null }));
    return () => {
      live = false;
    };
  }, [mediaId]);
  return url && url.id === mediaId ? url.url : null;
}

export function PhotoSlot({
  label,
  icon: Icon,
  action,
  state,
  onPick,
  className,
  wide = false,
}: {
  label: string;
  icon: IconComponent;
  /** "Take photo" on a phone, "Add photo" elsewhere. */
  action: string;
  state: SlotState;
  onPick: () => void;
  className?: string;
  /** The cover: one wide tile. */
  wide?: boolean;
}) {
  const filledId = state.kind === 'filled' && !state.preview ? state.mediaId : null;
  const remote = useMediaUrl(filledId);
  const tile = cn(
    'relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-center',
    wide ? 'aspect-2/1' : 'aspect-4/3',
    className,
  );

  if (state.kind === 'failed') {
    return (
      <button
        type="button"
        onClick={onPick}
        className={cn(tile, 'border-2 border-danger bg-danger-bg px-3')}
      >
        <TriangleAlert className="size-6 text-danger" />
        <span className="text-14 font-bold text-ink">{label} didn’t upload</span>
        <span className="text-14 text-danger">Tap to try again</span>
      </button>
    );
  }

  if (state.kind === 'uploading') {
    return (
      <div className={cn(tile, 'bg-surface-2')} role="status">
        {state.preview ? (
          <Img
            src={state.preview}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-60"
          />
        ) : null}
        <span className="relative flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-14 font-semibold text-ink">
          <LoaderCircle className="size-4 motion-safe:animate-spin" />
          Uploading {label.toLowerCase()}
        </span>
      </div>
    );
  }

  if (state.kind === 'filled') {
    const src = state.preview ?? remote;
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={`${label} photo added. Replace it`}
        className={cn(tile, 'bg-surface-2')}
      >
        {src ? (
          <Img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-14 text-muted">
            <Icon className="size-6 text-ink-2" />
            Photo added
          </span>
        )}
        <Badge tone="surface" icon={Icon} className="absolute bottom-3 left-3">
          {label}
        </Badge>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${label}: ${action}`}
      className={cn(tile, 'border-2 border-dashed border-line-strong bg-surface px-3')}
    >
      <Icon className="size-6 text-ink-2" />
      <span className="text-16 font-semibold text-ink">{label}</span>
      <span className="text-14 text-muted">{action}</span>
    </button>
  );
}
