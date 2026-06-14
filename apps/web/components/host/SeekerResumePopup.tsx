"use client";

import { Icon } from "@explore-and-earn/ui";
import type { SeekerResume } from "@explore-and-earn/db";

import { PopupShell } from "../overlay/PopupShell";
import { SeekerResumeCard } from "../seeker/SeekerResumeCard";
import styles from "./SeekerResumePopup.module.css";

export interface SeekerResumePopupProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The applicant's display name (used as popup title / override) */
  readonly applicantName: string | null;
  /** Resume data — null shows an "incomplete" state */
  readonly resume: SeekerResume | null;
  /** Optional link to the full applicant detail page */
  readonly detailHref?: string;
  /** Optional link to start a message thread with this seeker */
  readonly messageHref?: string;
}

export function SeekerResumePopup({
  open,
  onClose,
  applicantName,
  resume,
  detailHref,
  messageHref,
}: SeekerResumePopupProps) {
  const name = applicantName ?? "Applicant";

  const footer =
    detailHref || messageHref ? (
      <div className={styles.footerActions}>
        {messageHref && (
          <a className={styles.messageBtn} href={messageHref}>
            <Icon name="action.message" size={20} aria-hidden />
            Message {name}
          </a>
        )}
        {detailHref && (
          <a className={styles.detailBtn} href={detailHref}>
            Full application
            <Icon name="action.forward" size={16} aria-hidden />
          </a>
        )}
      </div>
    ) : undefined;

  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title={name}
      size="wide"
      eyebrow={
        <span className={styles.eyebrow}>
          <Icon name="nav.profile" size={16} aria-hidden />
          Applicant resume
        </span>
      }
      footer={footer}
    >
      {resume ? (
        <SeekerResumeCard resume={resume} displayNameOverride={applicantName} />
      ) : (
        <div className={styles.emptyState}>
          <Icon name="system.info" size={24} aria-hidden />
          <p>This applicant hasn&apos;t completed their resume yet.</p>
        </div>
      )}
    </PopupShell>
  );
}
