"use client";

import { useState, useTransition } from "react";
import posthog from "posthog-js";

import { Button } from "@explore-and-earn/ui";
import type { SeekerProfile } from "@explore-and-earn/db";

import { AVAILABILITY_OPTIONS } from "./profileFields";
import type { UpdateProfileAction } from "../../app/actions/seeker";
import styles from "./ProfileEditor.module.css";

export interface ProfileEditorProps {
	readonly profile: SeekerProfile;
	readonly updateProfile: UpdateProfileAction;
	readonly onClose: () => void;
}

/**
 * Client form for the editable seeker fields: display name, short bio, skills
 * (comma-separated, persisted to desired_roles), and availability. On a
 * successful save we emit the PostHog `profile_updated` event here on the
 * client — posthog-js is browser-only (wired in apps/web/app/providers.tsx),
 * so the event must not be emitted from the server action.
 */
export function ProfileEditor({
	profile,
	updateProfile,
	onClose,
}: ProfileEditorProps) {
	const [availability, setAvailability] = useState<string>(
		profile.availabilityStatus ?? "",
	);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleAction(formData: FormData) {
		setError(null);
		startTransition(async () => {
			const result = await updateProfile(formData);
			if (result.ok) {
				posthog.capture("profile_updated");
				onClose();
			} else {
				setError(result.error);
			}
		});
	}

	return (
		<form action={handleAction} className={styles.form}>
			<div className={styles.field}>
				<label className={styles.label} htmlFor="profile-display-name">
					Display name
				</label>
				<input
					id="profile-display-name"
					name="display_name"
					className={styles.input}
					type="text"
					defaultValue={profile.displayName ?? ""}
					maxLength={120}
					autoComplete="name"
				/>
			</div>

			<div className={styles.field}>
				<label className={styles.label} htmlFor="profile-bio">
					Short bio
				</label>
				<textarea
					id="profile-bio"
					name="short_bio"
					className={styles.textarea}
					rows={4}
					defaultValue={profile.shortBio ?? ""}
					maxLength={600}
				/>
			</div>

			<div className={styles.field}>
				<label className={styles.label} htmlFor="profile-skills">
					Skills &amp; desired roles
				</label>
				<input
					id="profile-skills"
					name="skills"
					className={styles.input}
					type="text"
					defaultValue={profile.skills.join(", ")}
					placeholder="e.g. Front desk, Tour guiding, Hospitality"
				/>
				<p className={styles.hint}>
					Comma-separated tags. Saved to your profile&rsquo;s desired-roles
					tags.
				</p>
			</div>

			<div className={styles.field}>
				<label className={styles.label} htmlFor="profile-availability">
					Availability
				</label>
				<select
					id="profile-availability"
					name="availability_status"
					className={styles.input}
					value={availability}
					onChange={(event) => setAvailability(event.target.value)}
				>
					<option value="">Not set</option>
					{AVAILABILITY_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>

			{availability === "date_range" ? (
				<div className={styles.range}>
					<div className={styles.field}>
						<label
							className={styles.label}
							htmlFor="profile-availability-start"
						>
							Available from
						</label>
						<input
							id="profile-availability-start"
							name="availability_start"
							className={styles.input}
							type="date"
							defaultValue={profile.availabilityStart ?? ""}
						/>
					</div>
					<div className={styles.field}>
						<label
							className={styles.label}
							htmlFor="profile-availability-end"
						>
							Available until
						</label>
						<input
							id="profile-availability-end"
							name="availability_end"
							className={styles.input}
							type="date"
							defaultValue={profile.availabilityEnd ?? ""}
						/>
					</div>
				</div>
			) : null}

			{error ? (
				<p className={styles.error} role="alert">
					{error}
				</p>
			) : null}

			<div className={styles.actions}>
				<Button type="submit" disabled={isPending}>
					{isPending ? "Saving…" : "Save profile"}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={onClose}
					disabled={isPending}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}
