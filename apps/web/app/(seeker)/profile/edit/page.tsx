import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getSeekerProfile } from "@explore-and-earn/db";

import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit profile",
};

const EMPTY_INITIAL: ProfileEditInitial = {
  displayName: "",
  bio: "",
  locationPref: null,
  housingPref: null,
  categories: [],
  freeformSkills: [],
};

export default async function SeekerProfileEditPage() {
  const initial = await resolveInitial();
  return <ProfileEditForm initial={initial} />;
}

async function resolveInitial(): Promise<ProfileEditInitial> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return EMPTY_INITIAL;
    }
    const token = await getToken({ template: "supabase" });
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
    return {
      displayName: profile.displayName ?? "",
      bio: profile.shortBio ?? "",
      locationPref: profile.locationPref ?? null,
      housingPref,
      categories: [...profile.desiredCategories],
      freeformSkills: [...profile.desiredRoles],
    };
  } catch {
    return EMPTY_INITIAL;
  }
}
