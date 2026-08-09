import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import {
  getSeekerTravelPrefsResult,
  type SeekerTravelPrefsLoadResult,
} from "@explore-and-earn/db";

import { updateTravelAction } from "../../../actions/seekerSettings";
import { EmptyState } from "../../../../components/discovery";
import { BucketPage } from "../../../../components/seeker";
import { SeekerSettingsForm } from "../../../../components/seeker/SeekerSettingsForm";
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "../../../../components/seeker/TravelPanel.module.css";

export const metadata: Metadata = {
  title: "Travel",
};

export const dynamic = "force-dynamic";

const DEV_TRAVEL_RESULT = {
  ok: true,
  travel: {
    travelReadiness: null,
    locationPref: "",
  },
} as const satisfies SeekerTravelPrefsLoadResult;

export default async function TravelPage() {
  const [t, devRole] = await Promise.all([
    getTranslations("Travel"),
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
  let travelResult: SeekerTravelPrefsLoadResult;

  if (isDevFixture) {
    travelResult = DEV_TRAVEL_RESULT;
  } else {
    if (devRole !== null) return signedOutState;

    const { userId, getToken } = await auth();
    const token = userId ? await getToken() : null;

    if (!userId || !token) return signedOutState;

    travelResult = await getSeekerTravelPrefsResult(token, userId);
  }

  return (
    <BucketPage
      title={t("title")}
      description={t("description")}
    >
      {travelResult.ok ? (
        <SeekerSettingsForm
          {...(isDevFixture
            ? {
                preview: {
                  id: "travel" as const,
                  notice: t("preview.notice"),
                  savedMessage: t("preview.saved"),
                },
              }
            : { action: updateTravelAction })}
          className={styles.form}
          buttonClassName={styles.button}
          ariaLabel={t("title")}
          submitLabel={t("save")}
          savingLabel={t("saving")}
          savedMessage={t("saved")}
          validationError={t("errors.validation")}
          unauthenticatedError={t("errors.unauthenticated")}
          temporarilyUnavailableError={t("errors.temporarilyUnavailable")}
        >
          <label className={styles.field}>
            <span className={styles.label}>{t("readiness.label")}</span>
            <select
              className={styles.select}
              name="travel_readiness"
              defaultValue={travelResult.travel.travelReadiness ?? ""}
            >
              <option value="">{t("readiness.notSet")}</option>
              <option value="local_only">{t("readiness.localOnly")}</option>
              <option value="willing_to_travel">
                {t("readiness.willingToTravel")}
              </option>
              <option value="ready_to_relocate">
                {t("readiness.readyToRelocate")}
              </option>
              <option value="remote_only">{t("readiness.remoteOnly")}</option>
              <option value="flexible">{t("readiness.flexible")}</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("location.label")}</span>
            <input
              className={styles.input}
              type="text"
              name="location_pref"
              defaultValue={travelResult.travel.locationPref}
              placeholder={t("location.placeholder")}
            />
          </label>
        </SeekerSettingsForm>
      ) : (
        <EmptyState
          title={t("loadError.title")}
          message={t("loadError.message")}
          actionLabel={t("loadError.retry")}
          actionHref="/travel"
        />
      )}
    </BucketPage>
  );
}
