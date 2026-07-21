"use client"

import {
	Button,
	DiscoveryCard,
	Icon,
	type DiscoveryCardData,
	type IconKey,
} from "@explore-and-earn/ui"
import type { MarketplaceCategory } from "@explore-and-earn/contracts"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type FormEvent } from "react"
import { createHostProfileAction } from "../../../../actions/hostProfile"
import styles from "./page.module.css"

type Step = "welcome" | "essentials" | "preview"
type FormState = { status: "idle" } | { status: "error"; message: string }

/** The four hiring lanes a host can hire in (a host may span several). */
type Lane = Exclude<MarketplaceCategory, "mix">

const LANES: ReadonlyArray<{ id: Lane; label: string; icon: IconKey; blurb: string }> = [
	{ id: "farm", label: "Farm", icon: "category.farm", blurb: "Harvest, ranch & land work" },
	{ id: "maritime", label: "Maritime", icon: "category.maritime", blurb: "Boats, docks & fisheries" },
	{ id: "remote", label: "Remote", icon: "category.remote", blurb: "Work from anywhere" },
	{ id: "seasonal", label: "Seasonal", icon: "category.seasonal", blurb: "Lodges, parks & events" },
]

const VALUE_POINTS: ReadonlyArray<{ icon: IconKey; head: string; body: string }> = [
	{
		icon: "action.search",
		head: "Reach seekers where they search",
		body: "Your roles surface in the feed, on the map, and in swipe — free to post.",
	},
	{
		icon: "benefit.housing",
		head: "Housing, Meals & Pay upfront",
		body: "Lead with the three things seekers decide on. No buried details.",
	},
	{
		icon: "trust.verified_host",
		head: "Your own command center",
		body: "A guided checklist takes you from sign-up to your first hire.",
	},
]

const STEP_ORDER: readonly Step[] = ["welcome", "essentials", "preview"]

const noop = () => {}

export default function HostOnboardingPage() {
	const router = useRouter()
	const [step, setStep] = useState<Step>("welcome")
	const [companyName, setCompanyName] = useState("")
	const [lanes, setLanes] = useState<readonly Lane[]>([])
	const [location, setLocation] = useState("")
	const [state, setState] = useState<FormState>({ status: "idle" })
	const [isPending, startTransition] = useTransition()

	const trimmedName = companyName.trim()
	const canContinue = trimmedName.length > 0 && lanes.length > 0
	const stepIndex = STEP_ORDER.indexOf(step)

	function toggleLane(lane: Lane) {
		setLanes((prev) =>
			prev.includes(lane) ? prev.filter((l) => l !== lane) : [...prev, lane],
		)
	}

	// A host spanning more than one lane reads as "mix" on the card; a single lane
	// keeps its own category identity.
	const previewCategory: MarketplaceCategory = useMemo(
		() => (lanes.length > 1 ? "mix" : (lanes[0] ?? "farm")),
		[lanes],
	)

	// PREVIEW ONLY — composes the LOCKED DiscoveryCard from what the host has
	// entered so far (name, lane, location). No fabricated metrics: no cover
	// photo, no pay figure, no match score — the triad carries instructional
	// placeholders the host fills when they post their first real role.
	const previewData: DiscoveryCardData = useMemo(
		() => ({
			id: "onboarding-preview",
			hostName: trimmedName || "Your organization",
			title: "Your first role",
			category: previewCategory,
			location: location.trim(),
			opportunityWindow: "Dates you choose",
			verifiedHost: false,
			triad: { housing: "You choose", meals: "You choose", pay: "You set the rate" },
			benefitProvision: { housing: "not_stated", meals: "not_stated", pay: "not_stated" },
		}),
		[trimmedName, previewCategory, location],
	)

	function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const result = await createHostProfileAction({
					companyName: trimmedName,
					categoryScopes: lanes,
					primaryLocationName: location,
				})
				if (result.ok) {
					router.push("/host")
					return
				}
				const message =
					result.error === "name_required"
						? "Please enter your company or farm name."
						: result.error === "lanes_required"
							? "Choose at least one hiring lane."
							: result.error === "name_too_long"
								? "Keep your organization name under 160 characters."
								: result.error === "location_too_long"
									? "Keep your primary location under 200 characters."
									: result.error === "unauthenticated"
										? "Please sign in to continue."
										: result.error === "account_unavailable"
											? "This account cannot create a host profile. Contact support if this looks wrong."
											: "Something went wrong. Please try again."
				setState({ status: "error", message })
			} catch {
				setState({
					status: "error",
					message: "Something went wrong. Please try again.",
				})
			}
		})
	}

	return (
		<main className={styles.page}>
			<section className={styles.shell} aria-live="polite">
				<header className={styles.head}>
					<p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
					<div
						className={styles.progress}
						role="progressbar"
						aria-valuemin={1}
						aria-valuemax={STEP_ORDER.length}
						aria-valuenow={stepIndex + 1}
						aria-label={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}
					>
						{STEP_ORDER.map((s, i) => (
							<span
								key={s}
								className={styles.progressSeg}
								data-done={i <= stepIndex ? "true" : undefined}
							/>
						))}
					</div>
				</header>

				{step === "welcome" ? (
					<div className={styles.card}>
						<h1 className={styles.title}>Welcome — let&apos;s get you hiring</h1>
						<p className={styles.subtitle}>
							Set up your host account in a couple of minutes. We ask for the
							essentials now and leave the rest for when you&apos;re ready.
						</p>
						<ul className={styles.values}>
							{VALUE_POINTS.map((v) => (
								<li key={v.head} className={styles.valueItem}>
									<span className={styles.valueIcon} aria-hidden>
										<Icon name={v.icon} size={20} />
									</span>
									<span className={styles.valueText}>
										<span className={styles.valueHead}>{v.head}</span>
										<span className={styles.valueBody}>{v.body}</span>
									</span>
								</li>
							))}
						</ul>
						<div className={styles.nav}>
							<Button
								variant="primary"
								type="button"
								icon="action.forward"
								onClick={() => setStep("essentials")}
							>
								Get started
							</Button>
						</div>
					</div>
				) : null}

				{step === "essentials" ? (
					<form
						className={styles.card}
						onSubmit={(e) => {
							e.preventDefault()
							if (canContinue) setStep("preview")
						}}
					>
						<h1 className={styles.title}>The essentials</h1>
						<p className={styles.subtitle}>
							Just enough for seekers to recognise you. Everything else waits.
						</p>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="companyName">
								Your organization name
							</label>
							<input
								id="companyName"
								name="companyName"
								className={styles.input}
								value={companyName}
								onChange={(event) => setCompanyName(event.target.value)}
								placeholder="e.g. Sunrise Valley Collective"
								autoComplete="organization"
								maxLength={160}
								disabled={isPending}
							/>
							<p className={styles.hint}>This is the name seekers apply to.</p>
						</div>

						<div className={styles.field}>
							<span className={styles.label}>Which lanes do you hire in?</span>
							<div className={styles.lanes} role="group" aria-label="Hiring lanes">
								{LANES.map((lane) => {
									const selected = lanes.includes(lane.id)
									return (
										<button
											key={lane.id}
											type="button"
											className={styles.lane}
											data-lane={lane.id}
											data-selected={selected ? "true" : undefined}
											aria-pressed={selected}
											onClick={() => toggleLane(lane.id)}
											disabled={isPending}
										>
											<span className={styles.laneIcon} aria-hidden>
												<Icon name={lane.icon} size={20} />
											</span>
											<span className={styles.laneText}>
												<span className={styles.laneLabel}>{lane.label}</span>
												<span className={styles.laneBlurb}>{lane.blurb}</span>
											</span>
											<span className={styles.laneCheck} aria-hidden>
												{selected ? <Icon name="system.success" size={16} /> : null}
											</span>
										</button>
									)
								})}
							</div>
							<p className={styles.hint}>Pick one or more — you can hire across lanes.</p>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="location">
								Primary location <span className={styles.optional}>(optional)</span>
							</label>
							<input
								id="location"
								name="location"
								className={styles.input}
								value={location}
								onChange={(event) => setLocation(event.target.value)}
								placeholder="e.g. Wenatchee, Washington"
								autoComplete="address-level2"
								maxLength={200}
								disabled={isPending}
							/>
							<p className={styles.hint}>Where most of your roles are based.</p>
						</div>

						<div className={styles.nav}>
							<Button
								variant="ghost"
								type="button"
								icon="action.back"
								onClick={() => setStep("welcome")}
							>
								Back
							</Button>
							<Button
								variant="primary"
								type="submit"
								icon="action.forward"
								disabled={!canContinue}
							>
								See your preview
							</Button>
						</div>
					</form>
				) : null}

				{step === "preview" ? (
					<form className={styles.card} onSubmit={handleCreate}>
						<h1 className={styles.title}>How seekers will see you</h1>
						<p className={styles.subtitle}>
							This is your listing&apos;s shape. Post your first role to fill in
							real dates, housing, meals &amp; pay.
						</p>

						{/* Non-interactive preview — the real, locked DiscoveryCard so the
						    host sees the authentic seeker experience (inert = no stray
						    tab stops or dead clicks). */}
						<div className={styles.preview} inert aria-label="Listing preview">
							<DiscoveryCard
								data={previewData}
								surface="discovery_feed"
								imageLoading="eager"
								onApply={noop}
								onSave={noop}
								onSkip={noop}
								onOpen={noop}
							/>
						</div>

						<ol className={styles.next} aria-label="What happens next">
							<li>Your command center opens with a guided checklist</li>
							<li>Post your first role with Housing, Meals &amp; Pay upfront</li>
							<li>Publish and start reaching seekers ready to move</li>
						</ol>

						<div className={styles.nav}>
							<Button
								variant="ghost"
								type="button"
								icon="action.back"
								onClick={() => setStep("essentials")}
								disabled={isPending}
							>
								Back
							</Button>
							<Button
								variant="primary"
								type="submit"
								icon="action.forward"
								disabled={isPending || !canContinue}
							>
								{isPending ? "Creating…" : "Create host account"}
							</Button>
						</div>
						{state.status === "error" ? (
							<p role="alert" className={styles.error}>
								{state.message}
							</p>
						) : null}
						<p className={styles.reassure}>
							You can add photos, your story, and more locations anytime.
						</p>
					</form>
				) : null}
			</section>
		</main>
	)
}
