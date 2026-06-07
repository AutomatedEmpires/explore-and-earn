import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authedClient, getSeekerProfile } from "@explore-and-earn/db";

import { updateTravelAction } from "../../actions/seekerSettings";
import { EmptyState } from "../../../components/discovery";
import { BucketPage } from "../../../components/seeker";
import styles from "../../../components/seeker/TravelPanel.module.css";

export const metadata: Metadata = {
  title: "Travel",
};

export const dynamic = "force-dynamic";

type TravelReadiness = "ready_now" | "flexible" | "planning" | "not_looking";

interface TravelValues {
  readonly travelReadiness: TravelReadiness;
  readonly locationPref: string;
}

const DEFAULT_TRAVEL: TravelValues = {
  travelReadiness: "planning",
  locationPref: "",
};

async function getTravelValues(
  token: string,
  userId: string,
): Promise<TravelValues> {
  const profile = await getSeekerProfile(token, userId);

  try {
    const db = authedClient(token) as unknown as SupabaseClient;
    const { data, error } = await db
      .from("seeker_profiles")
      .select("travel_readiness, location_pref")
      .eq("clerk_user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return { ...DEFAULT_TRAVEL, locationPref: profile?.locationPref ?? "" };
    }

    const row = data as Record<string, unknown>;
    const rawReadiness = row.travel_readiness;
    const travelReadiness =
      rawReadiness === "ready_now" ||
      rawReadiness === "flexible" ||
      rawReadiness === "planning" ||
      rawReadiness === "not_looking"
        ? rawReadiness
        : DEFAULT_TRAVEL.travelReadiness;

    return {
      travelReadiness,
      locationPref:
        typeof row.location_pref === "string"
          ? row.location_pref
          : profile?.locationPref ?? "",
    };
  } catch {
    return { ...DEFAULT_TRAVEL, locationPref: profile?.locationPref ?? "" };
  }
}

export default async function TravelPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Travel preferences"
        description="Share where you're open to going and how soon you can move."
      >
        <EmptyState
          title="Sign in to manage travel preferences"
          message="Once you're signed in, you can keep your travel readiness current for hosts."
        />
      </BucketPage>
    );
  }

  const travel = await getTravelValues(token, userId);

  return (
    <BucketPage
      title="Travel preferences"
      description="Share where you're open to going and how soon you can move."
    >
      <form className={styles.form} action={async (fd: FormData) => { await updateTravelAction(fd); }}>
        <label className={styles.field}>
          <span className={styles.label}>Travel readiness</span>
          <select
            className={styles.select}
            name="travel_readiness"
            defaultValue={travel.travelReadiness}
          >
            <option value="ready_now">Ready now</option>
            <option value="flexible">Flexible</option>
            <option value="planning">Planning</option>
            <option value="not_looking">Not looking</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Preferred location</span>
          <input
            className={styles.input}
            type="text"
            name="location_pref"
            defaultValue={travel.locationPref}
            placeholder="Pacific Northwest, US"
          />
        </label>

        <button className={styles.button} type="submit">
          Save travel preferences
        </button>
      </form>
    </BucketPage>
  );
}
