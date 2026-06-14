"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { Icon } from "@explore-and-earn/ui";
import { uploadProfilePhoto } from "@explore-and-earn/db/client";
import { saveHeroCoverAction } from "../../app/actions/seekerProfile";
import styles from "./HeroPhotoPickerModal.module.css";

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

const GRADIENT_OPTIONS: readonly GradientOption[] = [
  { key: "maritime", label: "Maritime", gradient: "linear-gradient(160deg, #0D3B5E 0%, #1B6B9E 50%, #4A9CC9 100%)" },
  { key: "farm", label: "Farm", gradient: "linear-gradient(160deg, #3D2B14 0%, #7A5C28 50%, #C49A50 100%)" },
  { key: "remote", label: "Remote", gradient: "linear-gradient(160deg, #1B2838 0%, #2D4A6B 50%, #5B7FA8 100%)" },
  { key: "seasonal", label: "Seasonal", gradient: "linear-gradient(160deg, #2D4A1E 0%, #5A8A32 50%, #C4A84A 100%)" },
  { key: "wilderness", label: "Wilderness", gradient: "linear-gradient(160deg, #1A1E0E 0%, #2D3A1A 50%, #5A6B3D 100%)" },
  { key: "coastal", label: "Coastal", gradient: "linear-gradient(160deg, #1A3850 0%, #2A7090 50%, #60B8C8 100%)" },
  { key: "mountain", label: "Mountain", gradient: "linear-gradient(160deg, #2A3040 0%, #4A5870 50%, #A0B8D0 100%)" },
  { key: "adventure", label: "Adventure", gradient: "linear-gradient(160deg, #2A1A08 0%, #7A3A1A 50%, #E06030 100%)" },
  { key: "sunset", label: "Sunset", gradient: "linear-gradient(160deg, #3A1A2A 0%, #8A3A5A 50%, #E88060 100%)" },
];

export function HeroPhotoPickerModal({
  open,
  onClose,
  onSelect,
  currentUrl,
  seekerProfileId,
}: HeroPhotoPickerModalProps) {
  const { getToken } = useAuth();
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

  const handleGradient = useCallback(
    async (gradient: string) => {
      const result = await saveHeroCoverAction(gradient);
      if (result.ok) {
        onSelect(gradient);
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
        const token = await getToken({ template: "supabase" });
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
            </div>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          {/* Gradient presets */}
          <p className={styles.sectionLabel}>Choose a landscape</p>
          <div className={styles.gradientGrid}>
            {GRADIENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`${styles.gradientSwatch} ${currentUrl === opt.gradient ? styles.swatchSelected : ""}`}
                style={{ background: opt.gradient }}
                onClick={() => void handleGradient(opt.gradient)}
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
