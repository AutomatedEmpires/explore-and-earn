"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { Icon } from "@explore-and-earn/ui";
import {
  GALLERY_MAX_IMAGES,
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_FILE_BYTES,
  type MediaBucketType,
} from "@explore-and-earn/contracts";

import styles from "./MediaGalleryUpload.module.css";

export interface GalleryItem {
  /** Stable local key for React. */
  readonly id: string;
  /** Public URL returned by the storage provider after upload. */
  readonly url: string;
  readonly bucket: MediaBucketType;
}

export interface MediaGalleryUploadProps {
  /** Ordered list of currently uploaded gallery images. */
  readonly images: ReadonlyArray<GalleryItem>;
  /** Called with the new ordered array after any add / remove / reorder. */
  readonly onChange: (images: ReadonlyArray<GalleryItem>) => void;
  /**
   * Performs the actual upload for a given slot index (0-based).
   * Resolved by the parent from `uploadListingMedia(token, hostProfileId, file, slotIndex)`.
   */
  readonly uploader: (file: File, slotIndex: number) => Promise<string>;
  /**
   * Called when an image is removed so the parent can delete the storage object.
   * If omitted, the item is removed from UI state only.
   */
  readonly remover?: (url: string) => Promise<void>;
  /** Maximum gallery images allowed. Defaults to GALLERY_MAX_IMAGES (10). */
  readonly maxImages?: number;
  readonly bucket?: MediaBucketType;
  readonly disabled?: boolean;
}

/**
 * Multi-image gallery manager for listing media.
 *
 * Supports upload, live preview, removal, and up/down reordering.
 * File type and size validation is derived from the media contracts so the
 * rules stay in a single canonical place.
 */
export function MediaGalleryUpload({
  images,
  onChange,
  uploader,
  remover,
  maxImages = GALLERY_MAX_IMAGES,
  bucket = "cover_photo",
  disabled = false,
}: MediaGalleryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const canAdd = images.length < maxImages && !disabled;
  const busy = uploading || disabled;

  async function handleFile(file: File) {
    setError(null);

    const allowedTypes: readonly string[] = UPLOAD_ALLOWED_MIME_TYPES;
    if (!allowedTypes.includes(file.type)) {
      setError("Please choose a JPEG, PNG, WebP, or HEIC image.");
      return;
    }
    if (file.size > UPLOAD_MAX_FILE_BYTES) {
      setError("Images must be 5 MB or smaller.");
      return;
    }
    if (images.length >= maxImages) {
      setError(`You can upload up to ${maxImages} gallery images.`);
      return;
    }

    const slotIndex = images.length;
    setUploading(true);
    try {
      const url = await uploader(file, slotIndex);
      const newItem: GalleryItem = {
        id: crypto.randomUUID(),
        url,
        bucket,
      };
      onChange([...images, newItem]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (busy || !canAdd) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function removeImage(item: GalleryItem) {
    if (remover) {
      try {
        await remover(item.url);
      } catch {
        // Deletion errors are non-fatal — remove from UI state anyway.
      }
    }
    onChange(images.filter((img) => img.id !== item.id));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === images.length - 1) return;
    const next = [...images];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  return (
    <div className={styles.wrap}>
      {images.length > 0 ? (
        <ol className={styles.list}>
          {images.map((item, index) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.thumb}>
                <Image
                  src={item.url}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  sizes="80px"
                  className={styles.thumbImage}
                  unoptimized={item.url.startsWith("blob:")}
                />
              </span>

              <span className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.orderButton}
                  onClick={() => moveUp(index)}
                  disabled={disabled || index === 0}
                  aria-label="Move image up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.orderButton}
                  onClick={() => moveDown(index)}
                  disabled={disabled || index === images.length - 1}
                  aria-label="Move image down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => void removeImage(item)}
                  disabled={disabled}
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Icon name="action.close" size={16} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {canAdd ? (
        <>
          <button
            type="button"
            className={isDragging ? styles.zoneDragging : styles.zone}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            disabled={busy}
            aria-label="Add gallery image"
          >
            {uploading ? (
              <span className={styles.uploadingLabel}>Uploading…</span>
            ) : (
              <span className={styles.placeholder}>
                <Icon name="action.share" size={20} aria-hidden />
                <span className={styles.placeholderLabel}>Add photo</span>
                <span className={styles.hint}>
                  {images.length}/{maxImages} · JPEG, PNG, WebP, HEIC up to 5 MB
                </span>
              </span>
            )}
          </button>

          <input
            ref={inputRef}
            className={styles.input}
            type="file"
            accept={UPLOAD_ALLOWED_MIME_TYPES.join(",")}
            onChange={onInputChange}
            disabled={busy}
            tabIndex={-1}
          />
        </>
      ) : null}

      {!canAdd && !disabled ? (
        <p className={styles.hint}>
          Maximum of {maxImages} gallery images reached.
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
