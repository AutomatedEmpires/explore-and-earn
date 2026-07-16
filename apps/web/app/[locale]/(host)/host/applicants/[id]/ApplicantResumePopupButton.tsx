"use client";

import { useState } from "react";
import { Icon } from "@explore-and-earn/ui";
import type { SeekerResume } from "@explore-and-earn/db";

import { SeekerResumePopup } from "../../../../../../components/host/SeekerResumePopup";
import styles from "./ApplicantResumePopupButton.module.css";

export interface ApplicantResumePopupButtonProps {
  readonly applicantName: string | null;
  readonly resume: SeekerResume | null;
  readonly applicationId: string;
  readonly seekerProfileId: string;
  readonly threadId?: string | null;
}

export function ApplicantResumePopupButton({
  applicantName,
  resume,
  applicationId,
  seekerProfileId,
  threadId,
}: ApplicantResumePopupButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={() => { setOpen(true); }}
      >
        <Icon name="nav.profile" size={20} aria-hidden />
        View full resume
      </button>

      <SeekerResumePopup
        open={open}
        onClose={() => { setOpen(false); }}
        applicantName={applicantName}
        resume={resume}
        detailHref={`/host/applicants/${applicationId}`}
        messageHref={
          threadId
            ? `/host/messages/${threadId}`
            : `/host/messages?seekerProfileId=${seekerProfileId}`
        }
      />
    </>
  );
}
