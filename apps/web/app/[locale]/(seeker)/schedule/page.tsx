import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getSeekerAvailability } from "@explore-and-earn/db";

import { updateScheduleAction } from "../../../actions/seekerSettings";
import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
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
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Schedule"
        description="Keep hosts aligned on when you're available."
      >
        <EmptyState
          title="Sign in to manage availability"
          message="Once you're signed in, you can share your availability window with hosts."
        />
      </BucketPage>
    );
  }

  const schedule = await getSeekerAvailability(token, userId);

  return (
    <BucketPage
      title="Schedule"
      description="Keep hosts aligned on when you're available."
    >
      <form className={styles.form} action={updateScheduleAction}>
        <label className={styles.field}>
          <span className={styles.label}>Start date</span>
          <input
            className={styles.input}
            type="date"
            name="availability_start"
            defaultValue={dateInputValue(schedule.availabilityStart)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>End date</span>
          <input
            className={styles.input}
            type="date"
            name="availability_end"
            defaultValue={dateInputValue(schedule.availabilityEnd)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            className={styles.select}
            name="availability_status"
            defaultValue={schedule.availabilityStatus}
          >
            <option value="available_now">Available now</option>
            <option value="date_range">Specific window</option>
            <option value="flexible">Flexible</option>
            <option value="unavailable">Not available</option>
          </select>
        </label>

        <button className={styles.button} type="submit">
          Save availability
        </button>
      </form>
    </BucketPage>
  );
}
