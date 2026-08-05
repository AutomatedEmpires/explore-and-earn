import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerProfileResult } from "@explore-and-earn/db";

import { EmptyState } from "../../../../../components/discovery";
import { BucketPage } from "../../../../../components/seeker";
import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";
import { formatPayCentsForInput } from "./profilePay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit profile",
};

const EMPTY_INITIAL: ProfileEditInitial = {
  seekerProfileId: null,
  profilePhotoUrl: "",
  displayName: "",
  bio: "",
  openToStatement: "",
  remotePreference: null,
  housingPref: null,
  mealsPref: null,
  payExpectationMinDollars: "",
  payExpectationMaxDollars: "",
  payExpectationUnit: "hour",
  payFlexible: false,
  categories: [],
  desiredRoles: [],
  generalSkills: [],
};

export default async function SeekerProfileEditPage() {
  const result = await resolveInitial();
  return (
    <BucketPage
      title="Edit profile"
      description="Update your name, bio, and preferences."
    >
      {result.ok ? (
        <ProfileEditForm initial={result.initial} />
      ) : (
        <EmptyState
          title="We couldn’t load your profile"
          message="Nothing has been changed. Check your connection and try again before editing."
          icon="system.info"
          actionLabel="Try again"
          actionHref="/profile/edit"
        />
      )}
    </BucketPage>
  );
}

type ProfileEditResolution =
  | { readonly ok: true; readonly initial: ProfileEditInitial }
  | { readonly ok: false };

async function resolveInitial(): Promise<ProfileEditResolution> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return { ok: false };
    }
    const token = await getToken();
    if (!token) {
      return { ok: false };
    }
    const loaded = await getSeekerProfileResult(token, userId);
    if (!loaded.ok) return { ok: false };
    const profile = loaded.profile;
    if (!profile) {
      return { ok: true, initial: EMPTY_INITIAL };
    }
    const housingPref =
      profile.housingPreference === "required" ||
      profile.housingPreference === "preferred" ||
      profile.housingPreference === "not_needed" ||
      profile.housingPreference === "flexible"
        ? profile.housingPreference
        : null;
    const mealsPref =
      profile.mealsPreference === "required" ||
      profile.mealsPreference === "preferred" ||
      profile.mealsPreference === "not_needed" ||
      profile.mealsPreference === "flexible"
        ? profile.mealsPreference
        : null;
    const toPayUnit = (u: string | null) =>
      u === "hour" || u === "day" || u === "week" || u === "month" || u === "year" ||
      u === "stipend" || u === "exchange" || u === "other"
        ? (u as "hour" | "day" | "week" | "month" | "year" | "stipend" | "exchange" | "other")
        : "hour" as const;
    return { ok: true, initial: {
      seekerProfileId: profile.id,
      profilePhotoUrl: profile.profilePhotoUrl ?? "",
      displayName: profile.displayName ?? "",
      bio: profile.shortBio ?? "",
      openToStatement: profile.openToStatement ?? "",
      remotePreference: profile.remotePreference ?? null,
      housingPref,
      mealsPref,
      payExpectationMinDollars: formatPayCentsForInput(
        profile.payExpectationMinCents,
      ),
      payExpectationMaxDollars: formatPayCentsForInput(
        profile.payExpectationMaxCents,
      ),
      payExpectationUnit: toPayUnit(profile.payExpectationUnit),
      payFlexible: profile.payFlexible,
      categories: [...profile.desiredCategories],
      desiredRoles: [...profile.desiredRoles],
      generalSkills: [...profile.generalSkills],
    } };
  } catch {
    return { ok: false };
  }
}
