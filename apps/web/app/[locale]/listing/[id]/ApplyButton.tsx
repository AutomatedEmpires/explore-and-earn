"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Modal } from "@explore-and-earn/ui";
import { applyToListingAction } from "../../actions/applications";
import { saveListingAction, unsaveListingAction } from "../../actions/savedListings";
import styles from "./ApplyButton.module.css";

interface Props {
  listingId: string;
  title: string;
  viewerRole: "guest" | "seeker" | "owner";
  alreadyApplied: boolean;
  alreadySaved: boolean;
  onboardingComplete: boolean;
}

export function ApplyButton({
  listingId,
  title,
  viewerRole,
  alreadyApplied,
  alreadySaved,
  onboardingComplete,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
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
        Sign in to apply
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
        Edit listing
      </Button>
    );
  }

  // Seeker role
  if (alreadyApplied) {
    return (
      <div className={styles.appliedState}>
        <span>✓</span>
        <span>Application sent</span>
      </div>
    );
  }

  const handleApply = () => {
    if (!onboardingComplete) {
      setShowOnboardingModal(true);
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
        } else {
          const msg = result.error === "rate_limit_exceeded"
            ? "You're applying too quickly. Please wait a moment and try again."
            : result.error === "unauthenticated"
              ? "Your session expired. Please sign in and try again."
              : (result.error ?? "Something went wrong. Please try again.");
          setApplyError(msg);
        }
      } catch {
        setApplyError("Something went wrong. Please try again.");
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
          Apply
        </Button>
        <Button
          variant="secondary"
          onClick={handleToggleSave}
          disabled={isPending}
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      {showConfirmModal && (
        <Modal heading="Apply to this listing?">
          <p className={styles.modalText}>
            Confirm your application to <strong>{title}</strong>. The host will
            review your profile and contact you if interested.
          </p>
          <div className={styles.buttonRow}>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isPending}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowConfirmModal(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {showOnboardingModal && (
        <Modal heading="Complete your profile first">
          <p className={styles.modalText}>
            You need to complete your seeker profile before applying to
            listings.
          </p>
          <div className={styles.buttonRow}>
            <Button
              variant="primary"
              onClick={() => router.push("/onboarding")}
            >
              Go to onboarding
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowOnboardingModal(false)}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {applyError && (
        <Modal heading="Could not submit application">
          <p className={styles.modalText}>{applyError}</p>
          <Button variant="ghost" onClick={() => setApplyError(null)}>
            Dismiss
          </Button>
        </Modal>
      )}
    </>
  );
}
