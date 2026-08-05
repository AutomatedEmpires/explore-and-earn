"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { MeetingType } from "@explore-and-earn/contracts";
import type { SchedulingRequest } from "@explore-and-earn/db/client";
import { Button } from "@explore-and-earn/ui";

import { proposeSchedulingAction } from "../../app/actions/scheduling";
import { InterviewScheduleCard } from "./InterviewScheduleCard";
import { canHostProposeInterview } from "./model";
import {
  formatTimeZoneLabel,
  resolvedTimeZone,
} from "../../lib/format";
import styles from "./InterviewScheduling.module.css";

interface HostInterviewSchedulerProps {
  readonly applicationId: string;
  readonly applicationStatus: string;
  readonly available: boolean;
  readonly request: SchedulingRequest | null;
  /** Dev-catalog only: the form renders but never invokes the server action. */
  readonly fixtureMode?: boolean;
}

function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Reject browser normalization of nonexistent DST wall times. */
function parseLocalSlot(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localInputValue(date) !== value) {
    return null;
  }
  // During the fall-back hour, two instants share one wall time. Browsers pick
  // one silently; reject it so a host never sends a time with an unintended
  // offset. Either adjacent instant matching the same input proves ambiguity.
  if (
    localInputValue(new Date(date.getTime() - 60 * 60 * 1000)) === value ||
    localInputValue(new Date(date.getTime() + 60 * 60 * 1000)) === value
  ) {
    return null;
  }
  return date.toISOString();
}

function currentZoneLabel(locale: string): string {
  return formatTimeZoneLabel(resolvedTimeZone(), new Date(), locale);
}

export function HostInterviewScheduler({
  applicationId,
  applicationStatus,
  available,
  request,
  fixtureMode = false,
}: HostInterviewSchedulerProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("InterviewScheduling");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [minimumSlot, setMinimumSlot] = useState<string | undefined>();
  const [maximumSlot, setMaximumSlot] = useState<string | undefined>();
  const [zoneLabel, setZoneLabel] = useState(() => t("zoneFallback"));
  const [composerOpen, setComposerOpen] = useState(
    fixtureMode || request?.status === "alternate_requested",
  );
  const submitGuard = useRef(false);
  useEffect(() => {
    setZoneLabel(currentZoneLabel(locale));
    const refreshClock = () => {
      const current = Date.now();
      setNowMs(current);
      // Inputs only retain minute precision. Advancing one full minute ensures
      // the value remains strictly more than the server's four-hour boundary.
      setMinimumSlot(
        localInputValue(new Date(current + 4 * 60 * 60 * 1000 + 60_000)),
      );
      setMaximumSlot(
        localInputValue(new Date(current + 180 * 24 * 60 * 60 * 1000)),
      );
    };
    refreshClock();
    const timer = window.setInterval(refreshClock, 30_000);
    return () => window.clearInterval(timer);
  }, [locale]);
  useEffect(() => {
    setComposerOpen(fixtureMode || request?.status === "alternate_requested");
  }, [fixtureMode, request?.currentRound, request?.id, request?.status]);
  const requestExpired =
    request?.status === "proposed" &&
    nowMs !== null &&
    new Date(request.expiresAt).getTime() <= nowMs;
  const canPropose =
    available &&
    canHostProposeInterview(
      applicationStatus,
      request,
      nowMs ?? Number.NEGATIVE_INFINITY,
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fixtureMode) return;
    if (submitGuard.current) return;
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawStartsAt = ["slot_1", "slot_2", "slot_3"]
      .map((name) => String(data.get(name) ?? "").trim())
      .filter(Boolean);
    const startsAt: string[] = [];
    for (const value of rawStartsAt) {
      const parsed = parseLocalSlot(value);
      if (!parsed) {
        setError(t("errors.invalid_slots"));
        return;
      }
      startsAt.push(parsed);
    }
    const timezone = resolvedTimeZone();
    submitGuard.current = true;
    startTransition(async () => {
      try {
        const result = await proposeSchedulingAction({
          applicationId,
          meetingType: String(data.get("meeting_type")) as MeetingType,
          durationMinutes: Number(data.get("duration_minutes")),
          proposalTimezone: timezone,
          meetingDetails: String(data.get("meeting_details") ?? ""),
          startsAt,
        });
        if (result.ok) {
          form.reset();
          router.refresh();
          return;
        }
        setError(t(`errors.${result.error ?? "unknown"}`));
      } catch {
        setError(t("errors.unknown"));
      } finally {
        submitGuard.current = false;
      }
    });
  }

  if (!available) return null;

  return (
    <div className={styles.hostStack}>
      {request ? (
        <InterviewScheduleCard request={request} viewerRole="host" />
      ) : null}

      {canPropose ? (
        <details
          className={styles.composer}
          open={composerOpen}
          onToggle={(event) => setComposerOpen(event.currentTarget.open)}
        >
          <summary className={styles.composerSummary}>
            {request?.status === "alternate_requested" || requestExpired
              ? t("composer.offerDifferent")
              : request
                ? t("composer.scheduleAnother")
                : t("composer.schedule")}
          </summary>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>{t("composer.format")}</span>
              <select name="meeting_type" defaultValue="video" required>
                <option value="video">{t("composer.video")}</option>
                <option value="phone">{t("composer.phone")}</option>
                <option value="in_person">{t("composer.inPerson")}</option>
                <option value="other">{t("composer.other")}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("composer.length")}</span>
              <select name="duration_minutes" defaultValue="30" required>
                {[15, 30, 45, 60, 90].map((minutes) => (
                  <option value={minutes} key={minutes}>
                    {t("durationMinutes", { minutes })}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.slotFieldset}>
              <legend>{t("composer.offerTimes")}</legend>
              <label className={styles.field}>
                <span>{t("composer.firstChoice")}</span>
                <input
                  type="datetime-local"
                  name="slot_1"
                  min={minimumSlot}
                  max={maximumSlot}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>{t("composer.secondChoice")}</span>
                <input
                  type="datetime-local"
                  name="slot_2"
                  min={minimumSlot}
                  max={maximumSlot}
                />
              </label>
              <label className={styles.field}>
                <span>{t("composer.thirdChoice")}</span>
                <input
                  type="datetime-local"
                  name="slot_3"
                  min={minimumSlot}
                  max={maximumSlot}
                />
              </label>
            </fieldset>
            <label className={styles.field}>
              <span>{t("composer.meetingDetails")}</span>
              <textarea
                name="meeting_details"
                maxLength={500}
                rows={3}
                placeholder={t("composer.meetingDetailsPlaceholder")}
                required
              />
            </label>
            <p className={styles.help}>
              {t("composer.zoneHelp", { zone: zoneLabel })}
            </p>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? t("composer.sending") : t("composer.send")}
            </Button>
            {error ? (
              <p className={styles.error} role="status" aria-live="polite">
                {error}
              </p>
            ) : null}
          </form>
        </details>
      ) : null}
    </div>
  );
}
