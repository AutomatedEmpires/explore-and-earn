"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";


import { Icon } from "@explore-and-earn/ui";
import { uploadProfilePhoto } from "@explore-and-earn/db/client";
import { saveHeroCoverAction } from "../../app/actions/seekerProfile";
import { useOptionalGetToken } from "../../lib/useOptionalGetToken";
import { curatedCovers } from "../../lib/curatedPhotos";
import styles from "./HeroPhotoPickerModal.module.css";

// Predefined COVER options for the seeker scope (cover is always separate from
// the profile logo/avatar). Distinct from host & admin sets — see curatedPhotos.
const SEEKER_COVERS = curatedCovers("seeker");

export interface HeroPhotoPickerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (url: string | null) => void;
  readonly currentUrl: string | null;
  readonly seekerProfileId: string | null;
  readonly category: string;
}

interface GradientOption {
  readonly key: string;
  readonly label: string;
  readonly gradient: string;
}

// Gradient values are tokenized. The selected value is persisted as the
// var() reference, which resolves to the token wherever it's applied as an
// inline background — and previously-saved literal gradients still render.
const GRADIENT_OPTIONS: readonly GradientOption[] = [
  { key: "maritime", label: "Maritime", gradient: "var(--gradient-category-maritime)" },
  { key: "farm", label: "Farm", gradient: "var(--gradient-category-farm)" },
  { key: "remote", label: "Remote", gradient: "var(--gradient-category-remote)" },
  { key: "seasonal", label: "Seasonal", gradient: "var(--gradient-category-seasonal)" },
  { key: "wilderness", label: "Wilderness", gradient: "var(--gradient-cover-wilderness)" },
  { key: "coastal", label: "Coastal", gradient: "var(--gradient-cover-coastal)" },
  { key: "mountain", label: "Mountain", gradient: "var(--gradient-cover-mountain)" },
  { key: "adventure", label: "Adventure", gradient: "var(--gradient-cover-adventure)" },
  { key: "sunset", label: "Sunset", gradient: "var(--gradient-cover-sunset)" },
];

export function HeroPhotoPickerModal({
  open,
  onClose,
  onSelect,
  currentUrl,
  seekerProfileId,
}: HeroPhotoPickerModalProps) {
  const getToken = useOptionalGetToken();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setError(null);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  // One handler for any predefined cover value — a Cloudinary photo URL or a
  // gradient token. SeekerHero renders either (isPhotoUrl decides).
  const handleSelectCover = useCallback(
    async (value: string) => {
      const result = await saveHeroCoverAction(value);
      if (result.ok) {
        onSelect(value);
        onClose();
      } else {
        setError("Could not save. Please try again.");
      }
    },
    [onSelect, onClose],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!seekerProfileId) return;
      setUploading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("no_token");
        const url = await uploadProfilePhoto(token, seekerProfileId, file, "seeker");
        const result = await saveHeroCoverAction(url);
        if (result.ok) {
          onSelect(url);
          onClose();
        } else {
          setError("Upload succeeded but save failed. Please try again.");
        }
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [seekerProfileId, getToken, onSelect, onClose],
  );

  const handleRemove = useCallback(async () => {
    const result = await saveHeroCoverAction(null);
    if (result.ok) {
      onSelect(null);
      onClose();
    }
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Choose hero background">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Choose Background</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon name="action.close" size={20} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Upload custom photo */}
          {seekerProfileId && (
            <div className={styles.uploadSection}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.fileInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Icon name="action.more" size={20} />
                {uploading ? "Uploading…" : "Upload your own photo"}
              </button>
              <p className={styles.uploadHint}>Your own photo looks best.</p>
            </div>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          {/* Predefined cover photos (seeker set) */}
          <p className={styles.sectionLabel}>Or pick a cover</p>
          <div className={styles.gradientGrid}>
            {SEEKER_COVERS.map((opt) => {
              const selected = currentUrl === opt.value;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`${styles.gradientSwatch} ${selected ? styles.swatchSelected : ""}`}
                  style={opt.kind === "gradient" ? { background: opt.value } : undefined}
                  onClick={() => void handleSelectCover(opt.value)}
                  aria-label={opt.label}
                  aria-pressed={selected}
                >
                  {opt.kind === "photo" ? (
                    <Image
                      src={opt.value}
                      alt=""
                      fill
                      sizes="(max-width: 520px) 33vw, 160px"
                      className={styles.coverPhoto}
                    />
                  ) : null}
                  <span className={styles.swatchLabel}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Landscape gradients */}
          <p className={styles.sectionLabel}>Landscapes</p>
          <div className={styles.gradientGrid}>
            {GRADIENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`${styles.gradientSwatch} ${currentUrl === opt.gradient ? styles.swatchSelected : ""}`}
                style={{ background: opt.gradient }}
                onClick={() => void handleSelectCover(opt.gradient)}
                aria-label={opt.label}
                aria-pressed={currentUrl === opt.gradient}
              >
                <span className={styles.swatchLabel}>{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Remove option */}
          {currentUrl && (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => void handleRemove()}
            >
              Remove custom background
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
