import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import {
  getSeekerAvailability,
  getSeekerSchedulingRequests,
} from "@explore-and-earn/db";

import { updateScheduleAction } from "../../../actions/seekerSettings";
import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
import { InterviewScheduleCard } from "../../../../components/scheduling/InterviewScheduleCard";
import styles from "../../../../components/seeker/SchedulePanel.module.css";

export const metadata: Metadata = {
  title: "Schedule",
};

export const dynamic = "force-dynamic";

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default async function SchedulePage() {
  const [authState, t] = await Promise.all([
    auth(),
    getTranslations("Schedule"),
  ]);
  const { userId, getToken } = authState;
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
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
  }

  const [schedule, interviews] = await Promise.all([
    getSeekerAvailability(token, userId),
    getSeekerSchedulingRequests(token, userId),
  ]);

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

      <section className={styles.section} aria-labelledby="availability-heading">
        <div>
          <h2 className={styles.sectionHeading} id="availability-heading">
            {t("availability.heading")}
          </h2>
          <p className={styles.sectionIntro}>
            {t("availability.description")}
          </p>
        </div>
        <form className={styles.form} action={updateScheduleAction}>
          <label className={styles.field}>
            <span className={styles.label}>{t("availability.startDate")}</span>
            <input
              className={styles.input}
              type="date"
              name="availability_start"
              defaultValue={dateInputValue(schedule.availabilityStart)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("availability.endDate")}</span>
            <input
              className={styles.input}
              type="date"
              name="availability_end"
              defaultValue={dateInputValue(schedule.availabilityEnd)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("availability.status")}</span>
            <select
              className={styles.select}
              name="availability_status"
              defaultValue={schedule.availabilityStatus}
            >
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

          <button className={styles.button} type="submit">
            {t("availability.save")}
          </button>
        </form>
      </section>
    </BucketPage>
  );
}
