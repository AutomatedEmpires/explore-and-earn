"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, Icon } from "@explore-and-earn/ui";

import { updateApplicationStatusAction } from "../../app/actions/applicationStatus";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  type ApplicantStage,
  type HostApplicantItem,
} from "./models";
import styles from "./ApplicantPipelineRow.module.css";

export interface ApplicantPipelineRowProps {
  readonly applicant: HostApplicantItem;
}

/** Map ApplicantStage -> the host-settable DB status value. */
const STAGE_TO_STATUS: Partial<Record<ApplicantStage, string>> = {
  reviewing: "reviewing",
  saved_by_host: "saved_by_host",
  offered: "offered",
  declined: "not_selected",
};

/** Quick-action buttons shown per current stage. */
type StageAction = {
  label: string;
  targetStage: ApplicantStage;
};

const STAGE_ACTIONS: Partial<Record<ApplicantStage, StageAction[]>> = {
  new: [
    { label: "Start review", targetStage: "reviewing" },
    { label: "Decline", targetStage: "declined" },
  ],
  reviewing: [
    { label: "Save", targetStage: "saved_by_host" },
    { label: "Make offer", targetStage: "offered" },
    { label: "Decline", targetStage: "declined" },
  ],
  saved_by_host: [
    { label: "Make offer", targetStage: "offered" },
    { label: "Decline", targetStage: "declined" },
  ],
  offered: [{ label: "Decline", targetStage: "declined" }],
};

/**
 * Compact pipeline row for an applicant with optimistic-UI status actions.
 * Calls the EXISTING `updateApplicationStatusAction` — no status logic here.
 */
export function ApplicantPipelineRow({ applicant }: ApplicantPipelineRowProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStage, setOptimisticStage] = useOptimistic(applicant.stage);

  const actions = STAGE_ACTIONS[optimisticStage] ?? [];

  function handleAction(targetStage: ApplicantStage) {
    const dbStatus = STAGE_TO_STATUS[targetStage];
    if (!dbStatus) return;

    startTransition(async () => {
      setOptimisticStage(targetStage);
      await updateApplicationStatusAction(
        applicant.id,
        dbStatus as Parameters<typeof updateApplicationStatusAction>[1],
      );
    });
  }

  return (
    <article
      className={styles.row}
      aria-label={`${applicant.applicantName}, ${APPLICANT_STAGE_LABEL[optimisticStage]}`}
    >
      <div className={styles.identity}>
        <Link className={styles.nameLink} href={`/host/applicants/${applicant.id}`}>
          <span className={styles.name}>{applicant.applicantName}</span>
        </Link>
        <span className={styles.meta}>
          {applicant.listing.title} · Applied {applicant.appliedOn}
        </span>
      </div>

      <div className={styles.badge}>
        <Badge
          label={APPLICANT_STAGE_LABEL[optimisticStage]}
          icon={APPLICANT_STAGE_ICON[optimisticStage]}
        />
      </div>

      <div className={styles.actions} aria-busy={isPending}>
        {actions.map((action) => (
          <Button
            key={action.targetStage}
            variant={action.targetStage === "declined" ? "ghost" : "secondary"}
            onClick={() => handleAction(action.targetStage)}
            disabled={isPending}
            aria-label={`${action.label} ${applicant.applicantName}`}
          >
            {action.label}
          </Button>
        ))}
        <Link
          className={styles.viewLink}
          href={`/host/applicants/${applicant.id}`}
          aria-label={`View details for ${applicant.applicantName}`}
        >
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
