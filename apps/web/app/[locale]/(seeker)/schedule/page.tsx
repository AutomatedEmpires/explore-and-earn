import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import {
  getSeekerAvailabilityResult,
  getSeekerSchedulingRequests,
  type SchedulingListResult,
  type SeekerAvailabilityLoadResult,
} from "@explore-and-earn/db";

import { updateScheduleAction } from "../../../actions/seekerSettings";
import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
import { SeekerSettingsForm } from "../../../../components/seeker/SeekerSettingsForm";
import { InterviewScheduleCard } from "../../../../components/scheduling/InterviewScheduleCard";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "../../../../components/seeker/SchedulePanel.module.css";

export const metadata: Metadata = {
  title: "Schedule",
};

export const dynamic = "force-dynamic";

const DEV_AVAILABILITY_RESULT = {
  ok: true,
  availability: {
    availabilityStart: null,
    availabilityEnd: null,
    availabilityStatus: null,
  },
} as const satisfies SeekerAvailabilityLoadResult;

const DEV_INTERVIEWS = {
  available: true,
  requests: [],
} as const satisfies SchedulingListResult;

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default async function SchedulePage() {
  const [t, devRole] = await Promise.all([
    getTranslations("Schedule"),
    isDevBenchEnabled() ? readDevRole() : Promise.resolve(null),
  ]);
  const isDevFixture = devRole === "seeker";
  const signedOutState = (
    <BucketPage
      title={t("title")}
      description={t("description")}
    >
      <EmptyState
        title={t("signedOut.title")}
        message={t("signedOut.message")}
      />
    </BucketPage>
  );
  let availabilityResult: SeekerAvailabilityLoadResult;
  let interviews: SchedulingListResult;

  if (isDevFixture) {
    availabilityResult = DEV_AVAILABILITY_RESULT;
    interviews = DEV_INTERVIEWS;
  } else {
    if (devRole !== null) return signedOutState;

    const { userId, getToken } = await auth();
    const token = userId ? await getToken() : null;

    if (!userId || !token) return signedOutState;

    [availabilityResult, interviews] = await Promise.all([
      getSeekerAvailabilityResult(token, userId),
      getSeekerSchedulingRequests(token, userId),
    ]);
  }

  return (
    <BucketPage
      title={t("title")}
      description={t("description")}
    >
      {interviews.available ? (
        <section className={styles.section} aria-labelledby="interviews-heading">
          <div>
            <h2 className={styles.sectionHeading} id="interviews-heading">
              {t("interviews.heading")}
            </h2>
            <p className={styles.sectionIntro}>
              {t("interviews.description")}
            </p>
          </div>
          {interviews.requests.length > 0 ? (
            <div className={styles.interviews}>
              {interviews.requests.map((request) => (
                <InterviewScheduleCard
                  key={request.id}
                  request={request}
                  viewerRole="seeker"
                  showListingTitle
                />
              ))}
            </div>
          ) : (
            <p className={styles.sectionIntro}>
              {t("interviews.empty")}
            </p>
          )}
        </section>
      ) : null}

      {availabilityResult.ok ? (
        <section className={styles.section} aria-labelledby="availability-heading">
          <div>
            <h2 className={styles.sectionHeading} id="availability-heading">
              {t("availability.heading")}
            </h2>
            <p className={styles.sectionIntro}>
              {t("availability.description")}
            </p>
          </div>
          <SeekerSettingsForm
            {...(isDevFixture
              ? {
                  preview: {
                    id: "schedule" as const,
                    notice: t("availability.preview.notice"),
                    savedMessage: t("availability.preview.saved"),
                  },
                }
              : { action: updateScheduleAction })}
            className={styles.form}
            buttonClassName={styles.button}
            ariaLabel={t("availability.heading")}
            submitLabel={t("availability.save")}
            savingLabel={t("availability.saving")}
            savedMessage={t("availability.saved")}
            validationError={t("availability.errors.validation")}
            unauthenticatedError={t("availability.errors.unauthenticated")}
            temporarilyUnavailableError={t(
              "availability.errors.temporarilyUnavailable",
            )}
          >
            <label className={styles.field}>
              <span className={styles.label}>{t("availability.startDate")}</span>
              <input
                className={styles.input}
                type="date"
                name="availability_start"
                defaultValue={dateInputValue(
                  availabilityResult.availability.availabilityStart,
                )}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t("availability.endDate")}</span>
              <input
                className={styles.input}
                type="date"
                name="availability_end"
                defaultValue={dateInputValue(
                  availabilityResult.availability.availabilityEnd,
                )}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t("availability.status")}</span>
              <select
                className={styles.select}
                name="availability_status"
                defaultValue={
                  availabilityResult.availability.availabilityStatus ?? ""
                }
              >
                <option value="">{t("availability.notSet")}</option>
                <option value="available_now">
                  {t("availability.availableNow")}
                </option>
                <option value="date_range">
                  {t("availability.specificWindow")}
                </option>
                <option value="flexible">{t("availability.flexible")}</option>
                <option value="unavailable">
                  {t("availability.unavailable")}
                </option>
              </select>
            </label>
          </SeekerSettingsForm>
        </section>
      ) : (
        <EmptyState
          title={t("availability.loadError.title")}
          message={t("availability.loadError.message")}
          actionLabel={t("availability.loadError.retry")}
          actionHref="/schedule"
        />
      )}
    </BucketPage>
  );
}
