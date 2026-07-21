"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { Icon, Skeleton } from "@explore-and-earn/ui";
import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_FILE_BYTES,
} from "@explore-and-earn/contracts";
import { isLocalStorageUrl } from "../lib/storageUrl";

import styles from "./ImageUpload.module.css";

type UploadState = "idle" | "uploading" | "done" | "error";

export interface ImageUploadProps {
  /** Called with the stored public URL once an upload completes. */
  readonly onUpload: (url: string) => void;
  /**
   * Performs the actual upload and resolves to the stored public URL.
   *
   * Injected by the parent so this component stays bucket-/identity-agnostic:
   * ImageUpload cannot know the target bucket, owning id, or Supabase token, so
   * the parent composes the db storage helper (uploadListingMedia /
   * uploadProfilePhoto) with the caller's token + owning id and passes it here.
   */
  readonly uploader: (file: File) => Promise<string>;
  readonly accept?: string;
  readonly label?: string;
  readonly currentUrl?: string;
  readonly disabled?: boolean;
  /** Input ceiling; server-routed uploads use 4 MiB under Vercel's body cap. */
  readonly maxFileBytes?: number;
}

/**
 * Reusable image upload control: a drag-and-drop zone with a click-to-browse
 * fallback, a live preview, and an idle -> uploading -> done | error lifecycle.
 * Uploads happen on file selection (not form submit). Token-only styling via
 * the CSS module; never hardcodes colors.
 */
export function ImageUpload({
  onUpload,
  uploader,
  accept = "image/*",
  label = "Upload image",
  currentUrl,
  disabled = false,
  maxFileBytes = UPLOAD_MAX_FILE_BYTES,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentUrl);
  const [isDragging, setIsDragging] = useState(false);

  // The parent owns the persisted URL. Keep the preview aligned when it clears
  // or replaces that value (for example, "Remove default" in the host library).
  useEffect(() => {
    setPreviewUrl(currentUrl);
    setState("idle");
    setError(null);
  }, [currentUrl]);

  const busy = state === "uploading" || disabled;

  async function handleFile(file: File) {
    setError(null);

    const allowedTypes: readonly string[] = UPLOAD_ALLOWED_MIME_TYPES;
    if (!allowedTypes.includes(file.type)) {
      setState("error");
      setError("Please choose a JPEG, PNG, WebP, or HEIC image.");
      return;
    }
    if (file.size > maxFileBytes) {
      setState("error");
      setError(`Images must be ${Math.floor(maxFileBytes / 1024 / 1024)} MB or smaller.`);
      return;
    }

    // Optimistic local preview while the upload is in flight.
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setState("uploading");

    try {
      const url = await uploader(file);
      setPreviewUrl(url);
      setState("done");
      onUpload(url);
    } catch (cause) {
      setState("error");
      setPreviewUrl(currentUrl);
      setError(
        cause instanceof Error ? cause.message : "Upload failed. Please try again.",
      );
    } finally {
      URL.revokeObjectURL(localPreview);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void handleFile(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function openPicker() {
    if (busy) return;
    inputRef.current?.click();
  }

  const showPreview = state !== "uploading" && Boolean(previewUrl);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={isDragging ? styles.zoneDragging : styles.zone}
        onClick={openPicker}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        disabled={busy}
        aria-label={label}
      >
        {state === "uploading" ? (
          <span className={styles.previewSlot}>
            <Skeleton variant="rect" />
          </span>
        ) : showPreview && previewUrl ? (
          <span className={styles.previewSlot}>
            <Image
              src={previewUrl}
              alt=""
              fill
              sizes="320px"
              className={styles.previewImage}
              unoptimized={previewUrl.startsWith("blob:") || isLocalStorageUrl(previewUrl)}
            />
          </span>
        ) : (
          <span className={styles.placeholder}>
            <Icon name="action.share" size={24} aria-hidden />
            <span className={styles.placeholderLabel}>{label}</span>
            <span className={styles.hint}>
              Drag &amp; drop or click to browse · Images up to{" "}
              {Math.floor(maxFileBytes / 1024 / 1024)} MB
            </span>
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept={accept}
        onChange={onInputChange}
        disabled={busy}
        tabIndex={-1}
      />

      {state === "error" && error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
