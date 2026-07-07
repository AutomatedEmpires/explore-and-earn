"use client"

import { Button } from "@explore-and-earn/ui"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { createHostProfileAction } from "../../../actions/hostProfile"
import styles from "./page.module.css"

type FormState = { status: "idle" } | { status: "error"; message: string }

export default function HostOnboardingPage() {
	const router = useRouter()
	const [companyName, setCompanyName] = useState("")
	const [state, setState] = useState<FormState>({ status: "idle" })
	const [isPending, startTransition] = useTransition()

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		startTransition(async () => {
			const result = await createHostProfileAction(companyName)
			if (result.ok) {
				router.push("/host")
				return
			}
			const message =
				result.error === "name_required"
					? "Please enter your company or farm name."
					: result.error === "unauthenticated"
						? "Please sign in to continue."
						: "Something went wrong. Please try again."
			setState({ status: "error", message })
		})
	}

	return (
		<main className={styles.page}>
			<section className={styles.card}>
				<p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
				<h1 className={styles.title}>Set up your host account</h1>
				<p className={styles.subtitle}>
					Tell us who you are so seekers know who they are applying to.
				</p>
				<form className={styles.form} onSubmit={handleSubmit}>
					<label className={styles.label} htmlFor="companyName">
						What&apos;s your company or farm name?
					</label>
					<input
						id="companyName"
						name="companyName"
						className={styles.input}
						value={companyName}
						onChange={(event) => setCompanyName(event.target.value)}
						placeholder="e.g. Sunrise Valley Collective"
						autoComplete="organization"
						disabled={isPending}
					/>
					<Button variant="primary" type="submit" disabled={isPending}>
						{isPending ? "Creating…" : "Create host account"}
					</Button>
					{state.status === "error" ? (
						<p role="alert" className={styles.error}>
							{state.message}
						</p>
					) : null}
				</form>
				<ol className={styles.next} aria-label="What happens next">
					<li>Your command center opens with a guided checklist</li>
					<li>Post your first role with Housing, Meals &amp; Pay upfront</li>
					<li>Publish and start reaching seekers ready to move</li>
				</ol>
				<p className={styles.reassure}>
					You can rename this and add photos, locations, and your story anytime.
				</p>
			</section>
		</main>
	)
}
