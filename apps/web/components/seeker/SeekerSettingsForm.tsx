"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import type { SeekerSettingsSaveResult } from "../../app/actions/seekerSettings";
import styles from "./SeekerSettingsForm.module.css";

type SaveFeedback =
	| { readonly kind: "idle" }
	| { readonly kind: "saving" }
	| { readonly kind: "saved" }
	| {
			readonly kind: "error";
			readonly error: Exclude<SeekerSettingsSaveResult, { readonly ok: true }>[
				"error"
			];
	  };

interface SeekerSettingsFormBaseProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly buttonClassName?: string;
	readonly ariaLabel?: string;
	readonly submitLabel: string;
	readonly savingLabel: string;
	readonly savedMessage: string;
	readonly validationError: string;
	readonly unauthenticatedError: string;
	readonly temporarilyUnavailableError: string;
}

type SeekerSettingsSaveBoundary =
	| {
			readonly action: (
				formData: FormData,
			) => Promise<SeekerSettingsSaveResult>;
			readonly preview?: never;
	  }
	| {
			readonly action?: never;
			readonly preview: {
				readonly id: "schedule" | "travel";
				readonly notice: string;
				readonly savedMessage: string;
			};
	  };

export type SeekerSettingsFormProps = SeekerSettingsFormBaseProps &
	SeekerSettingsSaveBoundary;

const IDLE_FEEDBACK: SaveFeedback = { kind: "idle" };

export function SeekerSettingsForm({
	action,
	children,
	className,
	buttonClassName,
	ariaLabel,
	submitLabel,
	savingLabel,
	savedMessage,
	validationError,
	unauthenticatedError,
	temporarilyUnavailableError,
	preview,
}: SeekerSettingsFormProps) {
	const inFlight = useRef(false);
	const [feedback, setFeedback] = useState<SaveFeedback>(IDLE_FEEDBACK);
	const isSaving = feedback.kind === "saving";

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (preview) {
			setFeedback({ kind: "saved" });
			return;
		}
		if (inFlight.current) return;

		inFlight.current = true;
		const formData = new FormData(event.currentTarget);
		setFeedback({ kind: "saving" });

		try {
			const result = await action(formData);
			setFeedback(
				result.ok
					? { kind: "saved" }
					: { kind: "error", error: result.error },
			);
		} catch {
			setFeedback({ kind: "error", error: "temporarily_unavailable" });
		} finally {
			inFlight.current = false;
		}
	}

	function clearStaleFeedback() {
		setFeedback((current) =>
			current.kind === "saving" || current.kind === "idle"
				? current
				: IDLE_FEEDBACK,
		);
	}

	const errorMessage =
		feedback.kind === "error"
			? feedback.error === "validation"
				? validationError
				: feedback.error === "unauthenticated"
					? unauthenticatedError
					: temporarilyUnavailableError
			: null;

	return (
		<form
			className={className}
			method="post"
			onSubmit={handleSubmit}
			onInput={clearStaleFeedback}
			aria-busy={isSaving}
			aria-label={ariaLabel ?? submitLabel}
			data-dev-fixture={preview?.id}
		>
			{preview ? (
				<p className={styles.preview} role="note">
					{preview.notice}
				</p>
			) : null}
			<fieldset className={styles.fieldset} disabled={isSaving}>
				{children}
				<div className={styles.actions}>
					<button className={buttonClassName} type="submit">
						{isSaving ? savingLabel : submitLabel}
					</button>
					{feedback.kind === "saved" ? (
						<p className={styles.success} role="status">
							{preview ? preview.savedMessage : savedMessage}
						</p>
					) : null}
					{errorMessage ? (
						<p className={styles.error} role="alert">
							{errorMessage}
						</p>
					) : null}
				</div>
			</fieldset>
		</form>
	);
}
