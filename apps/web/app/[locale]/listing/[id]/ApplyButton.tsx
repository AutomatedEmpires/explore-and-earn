"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Modal } from "@explore-and-earn/ui";
import { applyToListingAction } from "../../../actions/applications";
import { saveListingAction, unsaveListingAction } from "../../../actions/savedListings";
import { resolveSaveOutcome } from "../../../../lib/saveOutcome";
import styles from "./ApplyButton.module.css";

interface Props {
  listingId: string;
  title: string;
  viewerRole: "guest" | "seeker" | "owner";
  alreadyApplied: boolean;
  alreadySaved: boolean;
  resumeComplete: boolean;
  /** Sourced listings have no host on the platform — see the sourced branch below. */
  isSourced?: boolean;
  /** The original public posting, when the source recorded one. */
  sourceUrl?: string | null;
}

export function ApplyButton({
  listingId,
  title,
  viewerRole,
  alreadyApplied,
  alreadySaved,
  resumeComplete,
  isSourced = false,
  sourceUrl = null,
}: Props) {
  const router = useRouter();
  const t = useTranslations("Apply");
  const tc = useTranslations("Common");
  const [isPending, startTransition] = useTransition();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  // One dialog for every failed action. It carries its own heading because
  // "Could not submit application" is the wrong thing to say when a Save fails.
  const [errorDialog, setErrorDialog] = useState<{
    heading: string;
    message: string;
  } | null>(null);
  const [saved, setSaved] = useState(alreadySaved);

  if (viewerRole === "guest" && !isSourced) {
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

  if (viewerRole === "owner" && !isSourced) {
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
  if (alreadyApplied && !isSourced) {
    return (
      // role="status" so the swap is announced: the modal unmounts and
      // router.refresh() replaces this row, which otherwise happens in silence
      // for a screen-reader user who has just committed to an application.
      <div className={styles.appliedState} role="status">
        {/* Decorative: the adjacent text already says it. Left announced, a
            screen reader reads "check mark Application sent". */}
        <span aria-hidden>✓</span>
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
          setErrorDialog({ heading: t("errorHeading"), message: msg });
        }
      } catch {
        setErrorDialog({ heading: t("errorHeading"), message: t("errorGeneric") });
      }
    });
  };

  /**
   * Save/unsave used to flip the label before knowing whether anything was
   * written: the result was discarded and nothing caught a throw, so a
   * rate-limited or signed-out seeker was told "Saved" while the listing was
   * not. The label now moves only on a confirmed write, and every other
   * outcome says what happened.
   */
  const handleToggleSave = () => {
    const nextSaved = !saved;
    startTransition(async () => {
      // null encodes "the action threw" — resolveSaveOutcome treats that the
      // same as an unexplained failure, because both mean we do not know the
      // write happened.
      const result = await (nextSaved
        ? saveListingAction(listingId)
        : unsaveListingAction(listingId)
      ).catch(() => null);

      const outcome = resolveSaveOutcome(nextSaved, result);
      if (outcome.kind === "committed") {
        setSaved(outcome.saved);
        return;
      }
      setErrorDialog({
        heading: nextSaved ? t("saveErrorHeading") : t("unsaveErrorHeading"),
        message:
          outcome.reason === "rate_limit_exceeded"
            ? t("saveErrorRateLimit")
            : outcome.reason === "unauthenticated"
              ? t("errorSessionExpired")
              : t("errorGeneric"),
      });
    });
  };

  /**
   * A sourced listing is a real public posting we found — no employer has
   * claimed it here, so there is nobody on the platform to receive an
   * application. 064 drops NOT NULL on listings.host_profile_id for exactly
   * this case, and the host-side applications query inner-joins host_profiles,
   * so an application would be invisible to everyone forever while the seeker
   * was shown "Application sent". Offering Apply here would manufacture a
   * conversion that does not exist, so the seeker's real next step — the
   * original posting — becomes the primary action instead. When the source
   * recorded no URL we say so plainly rather than render a button to nowhere.
   * (applyToListing refuses these server-side too; this is the honest surface,
   * not the enforcement.)
   */
  if (isSourced) {
    return (
      <>
        <div className={styles.buttonRow}>
          {sourceUrl ? (
            <a
              className={`ui-button ui-button--primary ${styles.sourcedApply}`}
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {t("applyOnOriginal")}
            </a>
          ) : (
            <p className={styles.sourcedUnavailable}>{t("sourcedNoApplyPath")}</p>
          )}
          {viewerRole === "seeker" && (
            <Button
              variant="secondary"
              onClick={handleToggleSave}
              disabled={isPending}
              aria-pressed={saved}
            >
              {saved ? tc("saved") : tc("save")}
            </Button>
          )}
        </div>
        {errorDialog && (
          <Modal heading={errorDialog.heading} onClose={() => setErrorDialog(null)}>
            <p className={styles.modalText}>{errorDialog.message}</p>
            <Button variant="ghost" onClick={() => setErrorDialog(null)}>
              {tc("dismiss")}
            </Button>
          </Modal>
        )}
      </>
    );
  }

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
          aria-pressed={saved}
        >
          {saved ? tc("saved") : tc("save")}
        </Button>
      </div>

      {showConfirmModal && (
        <Modal
          heading={t("confirmHeading")}
          onClose={() => setShowConfirmModal(false)}
        >
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
        <Modal
          heading={t("resumeGateHeading")}
          onClose={() => setShowResumeModal(false)}
        >
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

      {errorDialog && (
        <Modal heading={errorDialog.heading} onClose={() => setErrorDialog(null)}>
          <p className={styles.modalText}>{errorDialog.message}</p>
          <Button variant="ghost" onClick={() => setErrorDialog(null)}>
            {tc("dismiss")}
          </Button>
        </Modal>
      )}
    </>
  );
}
