import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authedClient, getSeekerProfile } from "@explore-and-earn/db";

import { updateScheduleAction } from "../../actions/seekerSettings";
import { EmptyState } from "../../../components/discovery";
import { BucketPage } from "../../../components/seeker";
import styles from "../../../components/seeker/SchedulePanel.module.css";

export const metadata: Metadata = {
  title: "Schedule",
};

export const dynamic = "force-dynamic";

type AvailabilityStatus = "available" | "flexible" | "not_available";

interface ScheduleValues {
  readonly availabilityStart: string | null;
  readonly availabilityEnd: string | null;
  readonly availabilityStatus: AvailabilityStatus;
}

const DEFAULT_SCHEDULE: ScheduleValues = {
  availabilityStart: null,
  availabilityEnd: null,
  availabilityStatus: "flexible",
};

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

async function getScheduleValues(
  token: string,
  userId: string,
): Promise<ScheduleValues> {
  await getSeekerProfile(token, userId);

  try {
    const db = authedClient(token) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("seeker_profiles")
      .select("availability_start, availability_end, availability_status")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) return DEFAULT_SCHEDULE;

    const row = data as Record<string, unknown>;
    const rawStatus = row.availability_status;
    const availabilityStatus =
      rawStatus === "available" ||
      rawStatus === "flexible" ||
      rawStatus === "not_available"
        ? rawStatus
        : DEFAULT_SCHEDULE.availabilityStatus;

    return {
      availabilityStart:
        typeof row.availability_start === "string"
          ? row.availability_start
          : null,
      availabilityEnd:
        typeof row.availability_end === "string" ? row.availability_end : null,
      availabilityStatus,
    };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export default async function SchedulePage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

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

  const schedule = await getScheduleValues(token, userId);

  return (
    <BucketPage
      title="Schedule"
      description="Keep hosts aligned on when you're available."
    >
      <form className={styles.form} action={async (fd: FormData) => { await updateScheduleAction(fd); }}>
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
            <option value="available">Available</option>
            <option value="flexible">Flexible</option>
            <option value="not_available">Not available</option>
          </select>
        </label>

        <button className={styles.button} type="submit">
          Save availability
        </button>
      </form>
    </BucketPage>
  );
}
