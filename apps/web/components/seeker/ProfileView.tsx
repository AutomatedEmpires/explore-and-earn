"use client";

import { useState } from "react";

import { Button, Chip, Icon } from "@explore-and-earn/ui";
import type { SeekerProfile } from "@explore-and-earn/db";

import { ProfileEditor } from "./ProfileEditor";
import { AVAILABILITY_LABEL } from "./profileFields";
import type { UpdateProfileAction } from "../../app/actions/seeker";
import styles from "./ProfileView.module.css";

export interface ProfileViewProps {
	readonly profile: SeekerProfile | null;
	readonly updateProfile: UpdateProfileAction;
}

/**
 * Live seeker identity card: avatar (initial fallback — there is no avatar_url
 * column; profile_photo_asset_id is surfaced as a "photo set" indicator only),
 * display name, short bio, availability, and skill/role tags. The "Edit" button
 * reveals the ProfileEditor inline. Reads come from getSeekerProfile via the
 * server page; writes flow through the updateProfile server action.
 */
export function ProfileView({ profile, updateProfile }: ProfileViewProps) {
	const [editing, setEditing] = useState(false);

	if (!profile) {
		return (
			<div className={styles.card}>
				<p className={styles.empty}>
					We&rsquo;re still setting up your profile. This can take a moment
					after you first sign up — please refresh shortly.
				</p>
			</div>
		);
	}

	if (editing) {
		return (
			<ProfileEditor
				profile={profile}
				updateProfile={updateProfile}
				onClose={() => setEditing(false)}
			/>
		);
	}

	const displayName = profile.displayName?.trim() || "Your name";
	const initial = displayName.charAt(0).toUpperCase() || "S";
	const availabilityLabel = profile.availabilityStatus
		? AVAILABILITY_LABEL[profile.availabilityStatus]
		: "Not set";

	return (
		<div className={styles.card}>
			<header className={styles.identity}>
				<span className={styles.avatar} aria-hidden>
					{initial}
				</span>
				<div className={styles.identityText}>
					<h3 className={styles.name}>{displayName}</h3>
					{profile.relativeLocation ? (
						<p className={styles.meta}>{profile.relativeLocation}</p>
					) : null}
				</div>
				<Button variant="secondary" onClick={() => setEditing(true)}>
					Edit
				</Button>
			</header>

			<p className={styles.bio}>
				{profile.shortBio?.trim() ||
					"Add a short bio so hosts can get to know you."}
			</p>

			<dl className={styles.facts}>
				<div className={styles.fact}>
					<dt className={styles.factLabel}>
						<Icon name="category.seasonal" size={16} aria-hidden /> Availability
					</dt>
					<dd className={styles.factValue}>{availabilityLabel}</dd>
				</div>
				{profile.hasProfilePhoto ? (
					<div className={styles.fact}>
						<dt className={styles.factLabel}>
							<Icon name="system.success" size={16} aria-hidden /> Photo
						</dt>
						<dd className={styles.factValue}>Profile photo set</dd>
					</div>
				) : null}
			</dl>

			{profile.skills.length > 0 ? (
				<ul className={styles.tags}>
					{profile.skills.map((skill) => (
						<li key={skill}>
							<Chip>{skill}</Chip>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
