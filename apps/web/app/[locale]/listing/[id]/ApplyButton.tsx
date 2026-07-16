"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Modal } from "@explore-and-earn/ui";
import { applyToListingAction } from "../../../actions/applications";
import { saveListingAction, unsaveListingAction } from "../../../actions/savedListings";
import styles from "./ApplyButton.module.css";

interface Props {
  listingId: string;
  title: string;
  viewerRole: "guest" | "seeker" | "owner";
  alreadyApplied: boolean;
  alreadySaved: boolean;
  resumeComplete: boolean;
}

export function ApplyButton({
  listingId,
  title,
  viewerRole,
  alreadyApplied,
  alreadySaved,
  resumeComplete,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Apply");
  const tc = useTranslations("Common");
  const [isPending, startTransition] = useTransition();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [saved, setSaved] = useState(alreadySaved);

  if (viewerRole === "guest") {
    return (
      <Button
        variant="primary"
        onClick={() => {
          router.push(`/sign-in?redirect_url=/listing/${listingId}`);
        }}
        disabled={isPending}
      >
        {t("signInToApply")}
      </Button>
    );
  }

  if (viewerRole === "owner") {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          router.push(`/host/listings/${listingId}/edit`);
        }}
      >
        {t("editListing")}
      </Button>
    );
  }

  // Seeker role
  if (alreadyApplied) {
    return (
      <div className={styles.appliedState}>
        <span>✓</span>
        <span>{t("applicationSent")}</span>
      </div>
    );
  }

  const handleApply = () => {
    if (!resumeComplete) {
      setShowResumeModal(true);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    setShowConfirmModal(false);
    startTransition(async () => {
      try {
        const result = await applyToListingAction(listingId);
        if (result.ok) {
          router.refresh();
        } else if (result.error === "resume_incomplete") {
          // Server-side gate rejected a stale client — surface the same
          // "finish your résumé" path rather than a generic error.
          setShowResumeModal(true);
        } else {
          const msg = result.error === "rate_limit_exceeded"
            ? t("errorRateLimit")
            : result.error === "unauthenticated"
              ? t("errorSessionExpired")
              : (result.error ?? t("errorGeneric"));
          setApplyError(msg);
        }
      } catch {
        setApplyError(t("errorGeneric"));
      }
    });
  };

  const handleToggleSave = () => {
    startTransition(async () => {
      if (saved) {
        await unsaveListingAction(listingId);
        setSaved(false);
      } else {
        await saveListingAction(listingId);
        setSaved(true);
      }
    });
  };

  return (
    <>
      <div className={styles.buttonRow}>
        <Button variant="primary" onClick={handleApply} disabled={isPending}>
          {tc("apply")}
        </Button>
        <Button
          variant="secondary"
          onClick={handleToggleSave}
          disabled={isPending}
        >
          {saved ? tc("saved") : tc("save")}
        </Button>
      </div>

      {showConfirmModal && (
        <Modal heading={t("confirmHeading")}>
          <p className={styles.modalText}>
            {t.rich("confirmBody", {
              title,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className={styles.buttonRow}>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {tc("confirm")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowConfirmModal(false)}
              disabled={isPending}
            >
              {tc("cancel")}
            </Button>
          </div>
        </Modal>
      )}

      {showResumeModal && (
        <Modal heading={t("resumeGateHeading")}>
          <p className={styles.modalText}>{t("resumeGateBody")}</p>
          <div className={styles.buttonRow}>
            <Button
              variant="primary"
              onClick={() => router.push("/resume")}
            >
              {t("finishResume")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowResumeModal(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        </Modal>
      )}

      {applyError && (
        <Modal heading={t("errorHeading")}>
          <p className={styles.modalText}>{applyError}</p>
          <Button variant="ghost" onClick={() => setApplyError(null)}>
            {tc("dismiss")}
          </Button>
        </Modal>
      )}
    </>
  );
}
