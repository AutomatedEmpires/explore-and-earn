import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerProfile } from "@explore-and-earn/db";

import { BucketPage } from "../../../../../components/seeker";
import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";

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
  locationPref: null,
  housingPref: null,
  mealsPref: null,
  payExpectationMinDollars: "",
  payExpectationMaxDollars: "",
  payExpectationUnit: "hour",
  payFlexible: false,
  categories: [],
  freeformSkills: [],
};

export default async function SeekerProfileEditPage() {
  const initial = await resolveInitial();
  return (
    <BucketPage
      title="Edit profile"
      description="Update your name, bio, and preferences."
    >
      <ProfileEditForm initial={initial} />
    </BucketPage>
  );
}

async function resolveInitial(): Promise<ProfileEditInitial> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return EMPTY_INITIAL;
    }
    const token = await getToken();
    if (!token) {
      return EMPTY_INITIAL;
    }
    const profile = await getSeekerProfile(token, userId);
    if (!profile) {
      return EMPTY_INITIAL;
    }
    const housingPref =
      profile.housingPreference === "preferred" ||
      profile.housingPreference === "not_needed"
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
    return {
      seekerProfileId: profile.id,
      profilePhotoUrl: profile.profilePhotoUrl ?? "",
      displayName: profile.displayName ?? "",
      bio: profile.shortBio ?? "",
      openToStatement: profile.openToStatement ?? "",
      locationPref: profile.locationPref ?? null,
      housingPref,
      mealsPref,
      payExpectationMinDollars: profile.payExpectationMinCents != null
        ? String(Math.round(profile.payExpectationMinCents / 100))
        : "",
      payExpectationMaxDollars: profile.payExpectationMaxCents != null
        ? String(Math.round(profile.payExpectationMaxCents / 100))
        : "",
      payExpectationUnit: toPayUnit(profile.payExpectationUnit),
      payFlexible: profile.payFlexible,
      categories: [...profile.desiredCategories],
      freeformSkills: [...profile.desiredRoles],
    };
  } catch {
    return EMPTY_INITIAL;
  }
}
