"use client"

import { Button } from "@explore-and-earn/ui"
import { useRouter } from "next/navigation"
import { useState, useTransition, type CSSProperties, type FormEvent } from "react"
import { applyToListingAction } from "../../app/actions/applications"

type ApplyState =
	| { status: "idle" }
	| { status: "applied" }
	| { status: "error"; message: string }

const formStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-8)",
	width: "100%",
}

const textareaStyle: CSSProperties = {
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	lineHeight: "var(--type-body-lh)",
	padding: "var(--space-12)",
	borderRadius: "var(--radius-cell)",
	background: "var(--color-surface-raised)",
	color: "var(--text-primary)",
	border: "none",
	resize: "vertical",
}

const messageStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-meta-size)",
	lineHeight: "var(--type-meta-lh)",
	color: "var(--text-secondary)",
}

export function ApplyForm({
	listingId,
	isAuthenticated,
	alreadyApplied,
}: {
	readonly listingId: string
	readonly isAuthenticated: boolean
	readonly alreadyApplied: boolean
}) {
	const router = useRouter()
	const [coverMessage, setCoverMessage] = useState("")
	const [state, setState] = useState<ApplyState>(
		alreadyApplied ? { status: "applied" } : { status: "idle" },
	)
	const [isPending, startTransition] = useTransition()

	if (!isAuthenticated) {
		return (
			<Button
				variant="primary"
				type="button"
				onClick={() => router.push("/sign-in")}
			>
				Sign in to apply
			</Button>
		)
	}

	if (state.status === "applied") {
		return (
			<Button variant="secondary" type="button" disabled>
				Applied
			</Button>
		)
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		startTransition(async () => {
			const result = await applyToListingAction(
				listingId,
				coverMessage.trim() || undefined,
			)
			if (result.ok || result.error === "already_applied") {
				setState({ status: "applied" })
				return
			}
			const message =
				result.error === "profile_not_found"
					? "Complete your profile first to apply."
					: result.error === "unauthenticated"
						? "Please sign in to apply."
						: "Something went wrong. Please try again."
			setState({ status: "error", message })
		})
	}

	return (
		<form style={formStyle} onSubmit={handleSubmit}>
			<textarea
				name="coverMessage"
				value={coverMessage}
				onChange={(event) => setCoverMessage(event.target.value)}
				placeholder="Add an optional note to the host"
				rows={4}
				style={textareaStyle}
				disabled={isPending}
			/>
			<Button
				variant="primary"
				icon="action.apply"
				type="submit"
				disabled={isPending}
			>
				{isPending ? "Submitting…" : "Apply to this opportunity"}
			</Button>
			{state.status === "error" ? (
				<p role="alert" style={messageStyle}>
					{state.message}
				</p>
			) : null}
		</form>
	)
}
