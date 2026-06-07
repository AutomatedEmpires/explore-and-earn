"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Modal } from "@explore-and-earn/ui";
import { applyToListingAction } from "../../actions/applications";
import { saveListingAction, unsaveListingAction } from "../../actions/savedListings";

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
      <div
        style=
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--type-body-size)",
          color: "var(--text-secondary)",
        
      >
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
      await applyToListingAction(listingId);
      router.refresh();
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
      <div style= display: "flex", gap: "var(--space-12)" >
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
          <p
            style=
              fontFamily: "var(--font-ui)",
              fontSize: "var(--type-body-size)",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-16)",
            
          >
            Confirm your application to <strong>{title}</strong>. The host will
            review your profile and contact you if interested.
          </p>
          <div style= display: "flex", gap: "var(--space-12)" >
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
          <p
            style=
              fontFamily: "var(--font-ui)",
              fontSize: "var(--type-body-size)",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-16)",
            
          >
            You need to complete your seeker profile before applying to
            listings.
          </p>
          <div style= display: "flex", gap: "var(--space-12)" >
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
    </>
  );
}
