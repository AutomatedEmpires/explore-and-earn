"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@explore-and-earn/ui";
import type { SchedulingRequest } from "@explore-and-earn/db/client";

import {
  cancelSchedulingAction,
  resolveSchedulingAction,
  respondToSchedulingAction,
  type SchedulingActionResult,
} from "../../app/actions/scheduling";
import styles from "./InterviewScheduling.module.css";
import {
  formatDateTimeInZone,
  resolvedTimeZone,
} from "../../lib/format";
import {
  canCompleteInterview,
  canRecordInterviewNoShow,
  showsSelectedInterviewTime,
} from "./model";

interface InterviewScheduleCardProps {
  readonly request: SchedulingRequest;
  readonly viewerRole: "host" | "seeker";
  readonly showListingTitle?: boolean;
  /** Dev-catalog only: renders controls without permitting mutations. */
  readonly readOnly?: boolean;
}

export function InterviewScheduleCard({
  request,
  viewerRole,
  showListingTitle = false,
  readOnly = false,
}: InterviewScheduleCardProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("InterviewScheduling");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [viewerTimezone, setViewerTimezone] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const actionGuard = useRef(false);
  useEffect(() => {
    setViewerTimezone(resolvedTimeZone());
  }, []);
  const currentOptions = request.options.filter(
    (option) => option.proposalRound === request.currentRound,
  );
  const selected = request.options.find(
    (option) => option.id === request.selectedOptionId,
  );
  useEffect(() => {
    let timer: number | undefined;
    const refreshClock = () => {
      const current = Date.now();
      setNowMs(current);
      const boundaries: number[] = [];
      if (
        request.status === "proposed" ||
        request.status === "alternate_requested"
      ) {
        boundaries.push(Date.parse(request.expiresAt));
      }
      if (viewerRole === "host" && request.status === "selected" && selected) {
        boundaries.push(
          Date.parse(selected.startsAt) + 15 * 60 * 1000,
          Date.parse(selected.endsAt),
        );
      }
      const next = Math.min(
        ...boundaries.filter(
          (boundary) => Number.isFinite(boundary) && boundary > current,
        ),
      );
      if (Number.isFinite(next)) {
        timer = window.setTimeout(
          refreshClock,
          Math.min(next - current + 50, 2_147_000_000),
        );
      }
    };
    refreshClock();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    request.expiresAt,
    request.status,
    selected?.endsAt,
    selected?.startsAt,
    viewerRole,
  ]);
  const responseExpired =
    (request.status === "proposed" ||
      request.status === "alternate_requested") &&
    nowMs !== null && new Date(request.expiresAt).getTime() <= nowMs;
  const noShowGraceElapsed = selected && nowMs !== null
    ? canRecordInterviewNoShow(selected.startsAt, nowMs)
    : false;
  const selectedEnded = selected && nowMs !== null
    ? canCompleteInterview(selected.endsAt, nowMs)
    : false;

  function run(action: () => Promise<SchedulingActionResult>) {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          router.refresh();
          return;
        }
        setError(t(`errors.${result.error ?? "unknown"}`));
      } catch {
        setError(t("errors.unknown"));
      } finally {
        actionGuard.current = false;
      }
    });
  }

  function cancel() {
    if (!window.confirm(t("cancelConfirm"))) return;
    run(() => cancelSchedulingAction(request.id));
  }

  const statusLabel = responseExpired
    ? t("status.responseEnded")
    : t(`status.${request.status}`);

  return (
    <section className={styles.card} aria-labelledby={`interview-${request.id}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitleGroup}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h3 className={styles.cardTitle} id={`interview-${request.id}`}>
            {showListingTitle && request.listingTitle
              ? request.listingTitle
              : t(`meeting.${request.meetingType}`)}
          </h3>
          {showListingTitle && request.listingTitle ? (
            <p className={styles.meta}>{t(`meeting.${request.meetingType}`)}</p>
          ) : null}
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </div>

      {selected && showsSelectedInterviewTime(request.status) ? (
        <div className={styles.confirmed}>
          <p className={styles.confirmedTime}>
            {formatDateTimeInZone(selected.startsAt, {
              timeZone: request.proposalTimezone,
              locale,
            })}
          </p>
          <p className={styles.meta}>
            {t("durationMinutes", { minutes: request.durationMinutes })}
          </p>
          {viewerTimezone && viewerTimezone !== request.proposalTimezone ? (
            <p className={styles.meta}>
              {t("yourTime", {
                time: formatDateTimeInZone(selected.startsAt, {
                  timeZone: viewerTimezone,
                  locale,
                }),
              })}
            </p>
          ) : null}
        </div>
      ) : request.status === "proposed" && !responseExpired ? (
        <ul className={styles.options} aria-label={t("proposedTimes")}>
          {currentOptions.map((option) => {
            const proposalTime = formatDateTimeInZone(option.startsAt, {
              timeZone: request.proposalTimezone,
              locale,
            });
            return (
              <li className={styles.option} key={option.id}>
                <span className={styles.optionTimes}>
                  <span>{proposalTime}</span>
                  {viewerTimezone && viewerTimezone !== request.proposalTimezone ? (
                    <span className={styles.meta}>
                      {t("yourTime", {
                        time: formatDateTimeInZone(option.startsAt, {
                          timeZone: viewerTimezone,
                          locale,
                        }),
                      })}
                    </span>
                  ) : null}
                </span>
                {viewerRole === "seeker" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={t("chooseTime", { time: proposalTime })}
                    disabled={isPending || readOnly}
                    onClick={() =>
                      run(() =>
                        respondToSchedulingAction(
                          request.id,
                          "selected",
                          option.id,
                        ),
                      )
                    }
                  >
                    {t("choose")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <dl className={styles.details}>
        <div>
          <dt>{t("details.where")}</dt>
          <dd>{request.meetingDetails}</dd>
        </div>
        <div>
          <dt>{t("details.timeZone")}</dt>
          <dd>{request.proposalTimezone}</dd>
        </div>
      </dl>

      {viewerRole === "host" && request.status === "proposed" && !responseExpired ? (
        <p className={styles.help}>{t("waitingForSeeker")}</p>
      ) : null}
      {viewerRole === "host" &&
      request.status === "alternate_requested" &&
      !responseExpired ? (
        <p className={styles.help}>{t("alternativesRequested")}</p>
      ) : null}
      {viewerRole === "host" &&
      request.status === "selected" &&
      !noShowGraceElapsed ? (
        <p className={styles.help} id={`no-show-help-${request.id}`}>
          {t("noShowHelp")}
        </p>
      ) : null}

      <div className={styles.actions}>
        {viewerRole === "seeker" && request.status === "proposed" && !responseExpired ? (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending || readOnly}
            onClick={() =>
              run(() =>
                respondToSchedulingAction(request.id, "alternate_requested"),
              )
            }
          >
            {t("askForAlternatives")}
          </Button>
        ) : null}
        {viewerRole === "host" && request.status === "selected" ? (
          <>
            <Button
              type="button"
              variant="primary"
              disabled={isPending || readOnly || !selectedEnded}
              onClick={() =>
                run(() => resolveSchedulingAction(request.id, "completed"))
              }
            >
              {t("markCompleted")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending || readOnly || !noShowGraceElapsed}
              aria-describedby={
                noShowGraceElapsed ? undefined : `no-show-help-${request.id}`
              }
              onClick={() =>
                run(() => resolveSchedulingAction(request.id, "no_show"))
              }
            >
              {t("recordNoShow")}
            </Button>
          </>
        ) : null}
        {(request.status === "proposed" ||
          request.status === "selected" ||
          request.status === "alternate_requested") &&
        !responseExpired ? (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending || readOnly}
            onClick={cancel}
          >
            {t("cancel")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </section>
  );
}
