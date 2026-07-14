import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getSeekerTravelPrefs } from "@explore-and-earn/db";

import { updateTravelAction } from "../../actions/seekerSettings";
import { EmptyState } from "../../../components/discovery";
import { BucketPage } from "../../../components/seeker";
import styles from "../../../components/seeker/TravelPanel.module.css";

export const metadata: Metadata = {
  title: "Travel",
};

export const dynamic = "force-dynamic";

export default async function TravelPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

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

  const travel = await getSeekerTravelPrefs(token, userId);

  return (
    <BucketPage
      title="Travel preferences"
      description="Share where you're open to going and how soon you can move."
    >
      <form className={styles.form} action={updateTravelAction}>
        <label className={styles.field}>
          <span className={styles.label}>Travel readiness</span>
          <select
            className={styles.select}
            name="travel_readiness"
            defaultValue={travel.travelReadiness}
          >
            <option value="local_only">Local only</option>
            <option value="willing_to_travel">Willing to travel</option>
            <option value="ready_to_relocate">Ready to relocate</option>
            <option value="remote_only">Remote / online only</option>
            <option value="flexible">Flexible</option>
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
