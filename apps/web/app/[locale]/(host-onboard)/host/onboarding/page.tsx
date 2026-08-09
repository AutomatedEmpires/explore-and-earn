"use client"

import { Button, DiscoveryCard, Icon, type DiscoveryCardData, type IconKey } from "@explore-and-earn/ui"
import type { CompensationUnit, MarketplaceCategory, MarketplaceLane } from "@explore-and-earn/contracts"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
	type FormEvent,
} from "react"

import {
	createHostProfileAction,
	updateHostProfileAction,
	uploadHostCoverAction,
	uploadHostLogoAction,
} from "../../../../actions/hostProfile"
import { createListingAction } from "../../../../actions/listings"
import { DemoEmployerPreview } from "../../../../../components/onboarding/DemoEmployerPreview"
import { HostSeekerPreview } from "../../../../../components/onboarding/HostSeekerPreview"
import {
	EMPTY_ONBOARDING_DRAFT,
	ONBOARDING_STEPS,
	ONBOARDING_STEP_META,
	canLeaveIdentityStep,
	payCents,
	profileGaps,
	roleCardReady,
	stepIndexOf,
	type HostOnboardingDraft,
	type OnboardingStep,
} from "../../../../../components/onboarding/hostOnboardingDraft"
import { PopupShell } from "../../../../../components/overlay/PopupShell"
import { safeInternalRedirect } from "../../../../../lib/authRedirect"
import { captureFunnelEvent } from "../../../../../lib/analytics/capture"
import { HOST_FUNNEL_EVENTS } from "../../../../../lib/analytics/events"
import { formatCompensation } from "../../../../../lib/format"
import styles from "./page.module.css"

/**
 * HOST ONBOARDING V2 (spec V2-E §§1–2).
 *
 * WHAT WAS REJECTED, AND WHY THIS IS SHAPED THE WAY IT IS. The previous flow was
 * three screens: a welcome carrying three value bullets, a form asking for a
 * name and a lane, and a card preview whose housing, meals and pay cells read
 * "You choose". A host was asked to spend their time on a product they had seen
 * no part of, and then shown a preview of a listing that did not exist yet, with
 * instructional placeholders standing in for the three facts the entire
 * marketplace is built on. Nothing on those screens was false; nothing on them
 * was evidence either.
 *
 * So the wizard now does two things at once on every screen: it collects one
 * thing, and it SHOWS what that thing does. The welcome carries a complete
 * employer profile built from the Enterprise demo records and rendered through
 * production components. The identity and story steps carry a live preview of
 * the host's OWN profile that redraws as they type. The preview step is the real
 * seeker-facing page. The role step composes the real DiscoveryCard.
 *
 * ── THE PLAN IS NOT ASKED FOR HERE ──────────────────────────────────────────
 * Migration 086 (D6) removed the paid-tier refusal from create_my_host_profile,
 * so building and previewing cost nothing and this wizard never routes to
 * checkout. The line the host meets later is PUBLICATION. Every screen says
 * payment is not required to begin, and the final step saves a DRAFT role rather
 * than attempting a publish it knows would be refused.
 *
 * ── AUTOSAVE, AND WHAT "SAVED" MEANS ────────────────────────────────────────
 * Two layers, because they answer different questions:
 *
 *   * localStorage holds the in-progress draft under ONBOARDING_DRAFT_KEY. It is
 *     read AFTER mount behind a `restored` flag, exactly as DemoSession does, so
 *     the server and client first paints cannot disagree. This is what makes
 *     "save and leave" and a closed tab survivable.
 *   * The SERVER holds everything a completed step produced. Leaving the
 *     identity step creates the host profile; leaving the story step updates it;
 *     the role step writes a listing row. So "saved" on this screen means a row,
 *     not a browser.
 *
 * The local copy is cleared once the role step has written its row — leaving a
 * stale draft behind would re-offer answers the host has already committed.
 *
 * ── WHAT IS NOT COLLECTED, AND WHY ──────────────────────────────────────────
 * Head count and hiring volume have no column, no filter and no surface. See
 * components/onboarding/hostOnboardingDraft.ts for the full accounting of where
 * every requested field went; the short version is that every input on these
 * screens writes somewhere a seeker can eventually read it, and the ones that
 * could not were removed rather than mocked.
 */

const ONBOARDING_DRAFT_KEY = "ee.host.onboarding.draft.v1"

/** How long the whole flow takes, stated up front so it can be planned around. */
const ESTIMATED_MINUTES = 8

type FormState = { status: "idle" } | { status: "error"; message: string }

const LANES: ReadonlyArray<{ id: MarketplaceLane; label: string; icon: IconKey; blurb: string }> = [
	{ id: "farm", label: "Farm", icon: "category.farm", blurb: "Harvest, ranch & land work" },
	{ id: "maritime", label: "Maritime", icon: "category.maritime", blurb: "Boats, docks & fisheries" },
	{ id: "remote", label: "Remote", icon: "category.remote", blurb: "Work from anywhere" },
	{ id: "seasonal", label: "Seasonal", icon: "category.seasonal", blurb: "Lodges, parks & events" },
]

const PAY_PERIODS: ReadonlyArray<{ id: CompensationUnit; label: string }> = [
	{ id: "hour", label: "per hour" },
	{ id: "day", label: "per day" },
	{ id: "week", label: "per week" },
	{ id: "month", label: "per month" },
	{ id: "stipend", label: "stipend" },
]

/**
 * The candidate-experience cards.
 *
 * NOT A CHECKBOX WALL, and not for style reasons. A grid of ticks asks a host to
 * assert things in a format that makes every one of them cost nothing to claim;
 * a card that states what a seeker gets, and asks for the sentence behind it,
 * produces copy the seeker can actually read. Each card here writes to a column
 * the public profile renders — nothing on this step is collected for its own
 * sake.
 */
const BENEFIT_CARDS: ReadonlyArray<{
	readonly id: "housing" | "meals"
	readonly icon: IconKey
	readonly title: string
	readonly body: string
	readonly affirmative: string
}> = [
	{
		id: "housing",
		icon: "benefit.housing",
		title: "Somewhere to live",
		body: "Housing is the first thing a seeker filters on. Saying you provide it puts you in front of everyone who cannot take a role without it.",
		affirmative: "We provide housing on our roles",
	},
	{
		id: "meals",
		icon: "benefit.meals",
		title: "Something to eat",
		body: "Crew meals change the real value of a wage more than most hosts expect, and they are the second filter seekers reach for.",
		affirmative: "We provide meals on our roles",
	},
]

/**
 * Facts that belong to a ROLE, not to an employer.
 *
 * The brief asked for schedule, transport, gear, bonuses, certifications and
 * accessibility on this step. They differ between the dock crew and the evening
 * kitchen, so an employer-level answer would be wrong for at least one role the
 * moment a second one exists. They are captured in the listing composer, and
 * this card says where rather than collecting a value that would have to be
 * overridden everywhere.
 */
const ROLE_LEVEL_FACTS: readonly string[] = [
	"Shift pattern and hours",
	"Getting there, and getting around once you have",
	"Gear provided, and gear to bring",
	"Bonuses and end-of-season pay",
	"Certifications a role requires",
	"Accessibility of the work and the housing",
]

const noop = () => {}

function isDraftShape(value: unknown): value is Partial<HostOnboardingDraft> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export default function HostOnboardingPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const [step, setStep] = useState<OnboardingStep>("welcome")
	const [draft, setDraft] = useState<HostOnboardingDraft>(EMPTY_ONBOARDING_DRAFT)
	const [restored, setRestored] = useState(false)
	const [profileSaved, setProfileSaved] = useState(false)
	const [state, setState] = useState<FormState>({ status: "idle" })
	const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
	const [uploadingLogo, setUploadingLogo] = useState(false)
	const [uploadingCover, setUploadingCover] = useState(false)
	const [isPending, startTransition] = useTransition()
	const logoInputRef = useRef<HTMLInputElement>(null)
	const coverInputRef = useRef<HTMLInputElement>(null)
	const headingRef = useRef<HTMLHeadingElement>(null)
	const reportedSteps = useRef(new Set<string>())

	const stepIndex = stepIndexOf(step)
	const stepMeta = ONBOARDING_STEP_META[stepIndex]
	const gaps = useMemo(() => profileGaps(draft), [draft])

	/**
	 * Where "save and leave" goes. An attacker-supplyable query parameter, so it
	 * runs through the same sanitizer the auth boundary uses (lib/authRedirect)
	 * rather than a second copy of the rule; anything that is not an internal
	 * path falls back to the workspace.
	 */
	const returnTo = safeInternalRedirect(searchParams.get("redirect_url") ?? undefined) ?? "/host"

	/**
	 * Fire a step event at most once per session, whatever the host does after.
	 *
	 * A step can be revisited — going Back and forward again is normal, and a host
	 * who edits their name three times has still completed the identity step once.
	 * Without this guard a completion rate would count revisits, so the funnel
	 * would report more completions than hosts.
	 */
	const reportOnce = useCallback((event: string): boolean => {
		if (reportedSteps.current.has(event)) return false
		reportedSteps.current.add(event)
		return true
	}, [])

	// ── Restore, then persist. Read after mount so the first paint matches SSR.
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY)
			if (raw) {
				const parsed: unknown = JSON.parse(raw)
				if (isDraftShape(parsed)) {
					setDraft({ ...EMPTY_ONBOARDING_DRAFT, ...parsed })
				}
			}
		} catch {
			// A malformed or unavailable store is a fresh start, never an error the
			// host has to read. Nothing has been lost that they know about.
		}
		setRestored(true)
		if (reportOnce(HOST_FUNNEL_EVENTS.onboardingStarted)) {
			captureFunnelEvent(HOST_FUNNEL_EVENTS.onboardingStarted)
		}
	}, [reportOnce])

	useEffect(() => {
		if (!restored) return
		try {
			window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft))
		} catch {
			// Quota or a private window. The server copy is the one that matters.
		}
	}, [draft, restored])

	/**
	 * Move focus to the new step's heading when the step changes.
	 *
	 * Without this, submitting a step leaves focus on a button that has just been
	 * unmounted, so it falls to <body> — a keyboard or screen-reader user lands at
	 * the top of the document and has to tab back through the entire header to
	 * reach the form they were already filling in. The heading takes tabIndex={-1}
	 * so it is programmatically focusable without becoming a tab stop of its own.
	 *
	 * Skipped on the first render: arriving at the welcome screen is not a step
	 * change, and stealing focus on load moves a visitor who has not asked to go
	 * anywhere.
	 */
	const firstPaint = useRef(true)
	useEffect(() => {
		if (firstPaint.current) {
			firstPaint.current = false
			return
		}
		headingRef.current?.focus()
	}, [step])

	const patch = useCallback((next: Partial<HostOnboardingDraft>) => {
		setDraft((prev) => ({ ...prev, ...next }))
	}, [])

	function toggleLane(lane: MarketplaceLane) {
		setDraft((prev) => ({
			...prev,
			lanes: prev.lanes.includes(lane)
				? prev.lanes.filter((l) => l !== lane)
				: [...prev.lanes, lane],
		}))
	}

	const companyName = draft.companyName.trim()
	const location = draft.primaryLocationName.trim()
	const canContinueIdentity = canLeaveIdentityStep(draft)

	// A host spanning more than one lane reads as "mix" on the card; a single lane
	// keeps its own category identity.
	const previewCategory: MarketplaceCategory = useMemo(
		() => (draft.lanes.length > 1 ? "mix" : (draft.lanes[0] ?? "seasonal")),
		[draft.lanes],
	)

	/**
	 * The role card, composed from the LOCKED DiscoveryCard.
	 *
	 * Rendered only when roleCardReady() says the triad can be filled from what
	 * the host typed. The previous flow rendered this card unconditionally with
	 * absent benefit evidence and placeholder triad copy, so a host's first sight
	 * of their own listing was three cells that said nothing. A card is how seekers
	 * compare employers; one with blanks in it teaches the wrong thing.
	 */
	const roleCard: DiscoveryCardData | null = useMemo(() => {
		if (!roleCardReady(draft)) return null
		const min = payCents(draft.rolePayMin)
		const max = payCents(draft.rolePayMax)
		return {
			id: "onboarding-role-preview",
			hostName: companyName || "Your organization",
			title: draft.roleTitle.trim(),
			category: (draft.roleCategory || previewCategory) as MarketplaceCategory,
			location,
			opportunityWindow:
				draft.roleStart && draft.roleEnd ? `${draft.roleStart} – ${draft.roleEnd}` : "",
			verifiedHost: false,
			triad: {
				housing: draft.roleHousingIncluded ? "Included" : "Not included",
				meals: draft.roleMealsIncluded ? "Included" : "Not included",
				pay: formatCompensation({ minCents: min, maxCents: max, unit: draft.rolePayPeriod }),
			},
			benefitProvision: {
				housing: draft.roleHousingIncluded ? "provided" : "not_provided",
				meals: draft.roleMealsIncluded ? "provided" : "not_provided",
				pay: "provided",
			},
		}
	}, [draft, companyName, location, previewCategory])

	/**
	 * Every step change goes through here, which is also where the seeker-preview
	 * event is reported.
	 *
	 * IT BELONGS HERE RATHER THAN IN THE PREVIEW COMPONENT. HostSeekerPreview is
	 * rendered in three places — the identity rail, the story rail, and the
	 * preview step — and React remounts it on every step change, because those are
	 * three different positions in the tree. A once-per-mount guard inside the
	 * component would therefore reset each time, and a host who stepped forward to
	 * their first role and came back would report a second opening. Reporting from
	 * the transition puts the event behind the same session-scoped guard as every
	 * other step, so the number means "hosts who reached the preview" rather than
	 * "times a component mounted".
	 */
	function goTo(next: OnboardingStep) {
		setState({ status: "idle" })
		if (next === "preview" && reportOnce(HOST_FUNNEL_EVENTS.seekerPreviewOpened)) {
			captureFunnelEvent(HOST_FUNNEL_EVENTS.seekerPreviewOpened)
		}
		setStep(next)
	}

	/** Persist the profile: create the first time, update every time after. */
	async function persistProfile(): Promise<{ ok: boolean; error?: string }> {
		if (!profileSaved) {
			const result = await createHostProfileAction({
				companyName,
				categoryScopes: draft.lanes,
				primaryLocationName: location,
			})
			if (result.ok) setProfileSaved(true)
			return result
		}
		return updateHostProfileAction({
			companyName,
			categoryScopes: [...draft.lanes],
			primaryLocationName: location,
			websiteUrl: draft.websiteUrl.trim() || null,
			tagline: draft.tagline.trim() || null,
			about: draft.about.trim() || null,
			housingOfferedGenerally: draft.housingOffered,
			mealsOfferedGenerally: draft.mealsOffered,
		})
	}

	function profileErrorMessage(error: string | undefined): string {
		switch (error) {
			case "name_required":
				return "Please enter your company or farm name."
			case "lanes_required":
				return "Choose at least one hiring lane."
			case "name_too_long":
				return "Keep your organization name under 160 characters."
			case "location_too_long":
				return "Keep your primary location under 200 characters."
			case "unauthenticated":
				return "Please sign in to continue."
			case "account_unavailable":
				return "This account cannot create a host profile. Contact support if this looks wrong."
			default:
				return "We could not save that just now. Nothing was lost — try again."
		}
	}

	function handleIdentitySubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!canContinueIdentity) return
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const result = await persistProfile()
				if (!result.ok) {
					setState({ status: "error", message: profileErrorMessage(result.error) })
					return
				}
				if (reportOnce(HOST_FUNNEL_EVENTS.companyIdentityCompleted)) {
					captureFunnelEvent(HOST_FUNNEL_EVENTS.companyIdentityCompleted)
					captureFunnelEvent(HOST_FUNNEL_EVENTS.profileCreated)
				}
				goTo("story")
			} catch {
				setState({ status: "error", message: "Something went wrong. Please try again." })
			}
		})
	}

	function handleStorySubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const result = await updateHostProfileAction({
					tagline: draft.tagline.trim() || null,
					about: draft.about.trim() || null,
					websiteUrl: draft.websiteUrl.trim() || null,
					housingOfferedGenerally: draft.housingOffered,
					mealsOfferedGenerally: draft.mealsOffered,
				})
				if (!result.ok) {
					setState({ status: "error", message: profileErrorMessage(result.error) })
					return
				}
				if (reportOnce(HOST_FUNNEL_EVENTS.storyCompleted)) {
					captureFunnelEvent(HOST_FUNNEL_EVENTS.storyCompleted)
					captureFunnelEvent(HOST_FUNNEL_EVENTS.benefitsCompleted)
				}
				goTo("preview")
			} catch {
				setState({ status: "error", message: "Something went wrong. Please try again." })
			}
		})
	}

	/**
	 * Save the first role as a DRAFT and land in the workspace.
	 *
	 * `status` is never sent: createListingAction writes at the database default,
	 * and migration 082's trigger refuses every entry into a live state for a host
	 * whose allowance is zero. Asking to publish here would be asking for a
	 * refusal, so the step asks for a draft and says that is what it saved.
	 */
	function handleRoleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const form = new FormData()
				form.set("title", draft.roleTitle.trim())
				form.set("category", draft.roleCategory || previewCategory)
				form.set("locationName", location)
				form.set("summary", draft.roleSummary.trim())
				form.set("housingProvision", draft.roleHousingIncluded ? "provided" : "not_provided")
				form.set("mealsProvision", draft.roleMealsIncluded ? "provided" : "not_provided")
				// MAJOR UNITS on the wire, cents in the column. ListingWriteFields.payMin
				// is a dollar figure that the db writer runs through toCentsOrNull, which
				// is the same contract the listing composer posts under — converting to
				// cents here would multiply by a hundred twice.
				form.set("payMin", draft.rolePayMin.trim())
				form.set("payMax", draft.rolePayMax.trim())
				form.set("payPeriod", draft.rolePayPeriod)
				form.set("startDate", draft.roleStart)
				form.set("endDate", draft.roleEnd)
				if (draft.roleCoverUrl) {
					form.set("coverPhotoUrl", draft.roleCoverUrl)
				}

				const result = await createListingAction(form)
				if (!result.ok) {
					setState({
						status: "error",
						message: result.error ?? "We could not save that draft. Try again in a moment.",
					})
					return
				}
				captureFunnelEvent(HOST_FUNNEL_EVENTS.listingDraftStarted)
				clearLocalDraft()
				// COMMERCIAL REDESIGN D6: straight into the workspace, always. The plan
				// ask is carried by the activation banner in the host shell, at a moment
				// when there is something to activate.
				router.push("/host")
			} catch {
				setState({ status: "error", message: "Something went wrong. Please try again." })
			}
		})
	}

	function clearLocalDraft() {
		try {
			window.localStorage.removeItem(ONBOARDING_DRAFT_KEY)
		} catch {
			// Nothing to recover; the row is written either way.
		}
	}

	/** Leave with everything captured so far persisted, and come back to it. */
	function handleSaveAndLeave() {
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				if (canContinueIdentity) {
					const result = await persistProfile()
					if (!result.ok) {
						setState({ status: "error", message: profileErrorMessage(result.error) })
						return
					}
				}
				router.push(returnTo)
			} catch {
				setState({ status: "error", message: "Something went wrong. Please try again." })
			}
		})
	}

	function handleLogoFile(file: File) {
		setUploadingLogo(true)
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const form = new FormData()
				form.set("file", file)
				const result = await uploadHostLogoAction(form)
				if (!result.ok || !result.url) {
					setState({
						status: "error",
						message:
							result.error === "profile_required"
								? "Add your company name and lane first — your logo attaches to your profile."
								: "That image could not be saved. Try a JPEG, PNG or WebP under the size limit.",
					})
					return
				}
				patch({ logoUrl: result.url })
				captureFunnelEvent(HOST_FUNNEL_EVENTS.logoUploaded)
			} catch {
				setState({ status: "error", message: "That upload did not finish. Try again." })
			} finally {
				setUploadingLogo(false)
			}
		})
	}

	/**
	 * The cover, stored now and bound when the role row is written.
	 *
	 * This is also the employer profile's cover band: the public /host/[id] page
	 * takes its cover from the host's first listing, so there is one cover per
	 * employer and it lives on a role. The preview above reflects that
	 * immediately — HostSeekerPreview is handed the same URL.
	 */
	function handleCoverFile(file: File) {
		setUploadingCover(true)
		startTransition(async () => {
			setState({ status: "idle" })
			try {
				const form = new FormData()
				form.set("file", file)
				const result = await uploadHostCoverAction(form)
				if (!result.ok || !result.url) {
					setState({
						status: "error",
						message:
							result.error === "profile_required"
								? "Save your company details first — a cover attaches to your profile."
								: "That image could not be saved. Try a JPEG, PNG or WebP under the size limit.",
					})
					return
				}
				patch({ roleCoverUrl: result.url })
				captureFunnelEvent(HOST_FUNNEL_EVENTS.coverUploaded)
			} catch {
				setState({ status: "error", message: "That upload did not finish. Try again." })
			} finally {
				setUploadingCover(false)
			}
		})
	}

	const livePreview = (
		<HostSeekerPreview draft={draft} hostProfileId="onboarding-preview" />
	)

	return (
		<main className={styles.page}>
			<div className={styles.shell}>
				<header className={styles.head}>
					<p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>

					{/* The stepper is a list, and the current step is marked on the item
					    rather than only by colour. */}
					<ol className={styles.stepper} aria-label="Onboarding steps">
						{ONBOARDING_STEP_META.map((meta, index) => (
							<li
								key={meta.id}
								className={styles.stepperItem}
								data-state={
									index < stepIndex ? "done" : index === stepIndex ? "current" : "todo"
								}
								aria-current={index === stepIndex ? "step" : undefined}
							>
								<span className={styles.stepperIndex} aria-hidden>
									{index + 1}
								</span>
								<span className={styles.stepperLabel}>{meta.label}</span>
							</li>
						))}
					</ol>

					<div
						className={styles.progress}
						role="progressbar"
						aria-valuemin={1}
						aria-valuemax={ONBOARDING_STEPS.length}
						aria-valuenow={stepIndex + 1}
						aria-label={`Step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}`}
					>
						{ONBOARDING_STEPS.map((s, i) => (
							<span
								key={s}
								className={styles.progressSeg}
								data-done={i <= stepIndex ? "true" : undefined}
							/>
						))}
					</div>

					{/* Announced on change, so a screen-reader user hears where they are
					    without the step heading having to be re-read from the top. */}
					<p className={styles.stepAnnounce} aria-live="polite">
						Step {stepIndex + 1} of {ONBOARDING_STEPS.length}: {stepMeta.label}.{" "}
						{stepMeta.outcome}.
					</p>
				</header>

				{/* ── 1. WELCOME ─────────────────────────────────────────────── */}
				{step === "welcome" ? (
					<div className={styles.split}>
						<div className={styles.card}>
							<h1 className={styles.title} ref={headingRef} tabIndex={-1}>Welcome — let&apos;s build your employer profile</h1>
							<p className={styles.subtitle}>
								By the end you will have an employer profile seekers can read and a
								first role saved as a draft, ready to publish whenever you choose to.
							</p>

							<dl className={styles.outcome}>
								<div className={styles.outcomeRow}>
									<dt>What you leave with</dt>
									<dd>A profile, a role draft, and a preview of both</dd>
								</div>
								<div className={styles.outcomeRow}>
									<dt>How long it takes</dt>
									<dd>About {ESTIMATED_MINUTES} minutes</dd>
								</div>
								<div className={styles.outcomeRow}>
									<dt>What it costs</dt>
									<dd>Nothing — publishing is the paid step, and it comes later</dd>
								</div>
							</dl>

							<p className={styles.noPayment}>
								<Icon name="system.info" size={18} aria-hidden />
								<span>
									Payment is not required to begin. You can build, preview and save
									everything here without choosing a plan.
								</span>
							</p>

							<div className={styles.nav}>
								<Button
									variant="primary"
									type="button"
									icon="action.forward"
									onClick={() => goTo("identity")}
								>
									Start building
								</Button>
								<Button
									variant="ghost"
									type="button"
									onClick={handleSaveAndLeave}
									disabled={isPending}
								>
									Save and finish later
								</Button>
							</div>

							{/* Mobile only: the same preview, full screen, on request. */}
							<button
								type="button"
								className={styles.mobilePreviewAction}
								onClick={() => setMobilePreviewOpen(true)}
							>
								<Icon name="nav.photos" size={18} aria-hidden />
								Preview what you&apos;re building
							</button>

							<p className={styles.tourLine}>
								Want the whole thing first?{" "}
								<Link className={styles.inlineLink} href="/for-hosts/demo">
									See the full product tour
								</Link>{" "}
								— a complete workspace mid-season, nothing to sign up for.
							</p>
						</div>

						<aside className={styles.rail} aria-label="Example employer profile">
							<DemoEmployerPreview />
						</aside>
					</div>
				) : null}

				{/* ── 2. COMPANY IDENTITY ────────────────────────────────────── */}
				{step === "identity" ? (
					<div className={styles.split}>
						<form className={styles.card} onSubmit={handleIdentitySubmit}>
							<h1 className={styles.title} ref={headingRef} tabIndex={-1}>Your company</h1>
							<p className={styles.subtitle}>
								How seekers recognise you. The preview beside this form is your own
								profile, and it redraws as you type.
							</p>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="companyName">
									Your organization name
								</label>
								<input
									id="companyName"
									name="companyName"
									className={styles.input}
									value={draft.companyName}
									onChange={(e) => patch({ companyName: e.target.value })}
									placeholder="e.g. Sunrise Valley Collective"
									autoComplete="organization"
									maxLength={160}
									required
									disabled={isPending}
								/>
								<p className={styles.hint}>This is the name seekers apply to.</p>
							</div>

							<div className={styles.field}>
								<span className={styles.label} id="lanes-label">
									Which lanes do you hire in?
								</span>
								<div className={styles.lanes} role="group" aria-labelledby="lanes-label">
									{LANES.map((lane) => {
										const selected = draft.lanes.includes(lane.id)
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
								<p className={styles.hint}>
									These are the categories seekers browse by — pick every one you hire
									in.
								</p>
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="location">
									Primary location <span className={styles.optional}>(optional)</span>
								</label>
								<input
									id="location"
									name="location"
									className={styles.input}
									value={draft.primaryLocationName}
									onChange={(e) => patch({ primaryLocationName: e.target.value })}
									placeholder="e.g. Wenatchee, Washington"
									autoComplete="address-level2"
									maxLength={200}
									disabled={isPending}
								/>
								<p className={styles.hint}>Where most of your roles are based.</p>
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="websiteUrl">
									Website <span className={styles.optional}>(optional)</span>
								</label>
								<input
									id="websiteUrl"
									name="websiteUrl"
									type="url"
									className={styles.input}
									value={draft.websiteUrl}
									onChange={(e) => patch({ websiteUrl: e.target.value })}
									placeholder="https://"
									autoComplete="url"
									disabled={isPending}
								/>
								<p className={styles.hint}>
									One outside link is the fastest way for a seeker to check you are
									real.
								</p>
							</div>

							<div className={styles.field}>
								<span className={styles.label} id="logo-label">
									Your logo <span className={styles.optional}>(optional)</span>
								</span>
								<div className={styles.logoRow}>
									<span className={styles.logoFrame} aria-hidden>
										{draft.logoUrl ? (
											<Image
												className={styles.logoImg}
												src={draft.logoUrl}
												alt=""
												fill
												sizes="56px"
											/>
										) : (
											<Icon name="nav.profile" size={22} />
										)}
									</span>
									<input
										ref={logoInputRef}
										id="logoFile"
										type="file"
										accept="image/jpeg,image/png,image/webp"
										className={styles.fileInput}
										aria-labelledby="logo-label"
										onChange={(e) => {
											const file = e.target.files?.[0]
											if (file) handleLogoFile(file)
											e.target.value = ""
										}}
										disabled={isPending || !profileSaved}
									/>
									<Button
										variant="ghost"
										type="button"
										onClick={() => logoInputRef.current?.click()}
										disabled={isPending || !profileSaved}
									>
										{uploadingLogo ? "Uploading…" : draft.logoUrl ? "Replace logo" : "Upload a logo"}
									</Button>
								</div>
								<p className={styles.hint}>
									{profileSaved
										? "Saved to your profile the moment it finishes uploading."
										: "Available once your name and lane are saved — a logo attaches to a profile."}
								</p>
							</div>

							{state.status === "error" ? (
								<p role="alert" className={styles.error}>
									{state.message}
								</p>
							) : null}

							<div className={styles.nav}>
								<Button
									variant="ghost"
									type="button"
									icon="action.back"
									onClick={() => goTo("welcome")}
									disabled={isPending}
								>
									Back
								</Button>
								<Button
									variant="primary"
									type="submit"
									icon="action.forward"
									disabled={isPending || !canContinueIdentity}
								>
									{isPending ? "Saving…" : "Save and continue"}
								</Button>
							</div>
							<button
								type="button"
								className={styles.leaveLink}
								onClick={handleSaveAndLeave}
								disabled={isPending}
							>
								Save and finish later
							</button>
						</form>

						<aside className={styles.rail} aria-label="Live preview of your profile">
							{livePreview}
						</aside>
					</div>
				) : null}

				{/* ── 3. STORY & CANDIDATE EXPERIENCE ────────────────────────── */}
				{step === "story" ? (
					<div className={styles.split}>
						<form className={styles.card} onSubmit={handleStorySubmit}>
							<h1 className={styles.title} ref={headingRef} tabIndex={-1}>Your story, and what people get</h1>
							<p className={styles.subtitle}>
								This is the part seekers spend longest on. Write it the way you would
								say it — the preview shows exactly what they will read.
							</p>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="tagline">
									One line about you
								</label>
								<input
									id="tagline"
									name="tagline"
									className={styles.input}
									value={draft.tagline}
									onChange={(e) => patch({ tagline: e.target.value })}
									placeholder="e.g. A lakeside season with staff cabins and crew meals"
									maxLength={200}
									disabled={isPending}
								/>
								<p className={styles.hint}>The line under your name on your profile.</p>
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="about">
									Why people come, and why they stay
								</label>
								<textarea
									id="about"
									name="about"
									className={styles.textarea}
									rows={7}
									value={draft.about}
									onChange={(e) => patch({ about: e.target.value })}
									placeholder="The season, the place, the crew, and what a week actually looks like."
									disabled={isPending}
								/>
								<p className={styles.hint}>
									The environment, the season, and the culture — in your words, not a
									list of adjectives.
								</p>
							</div>

							<div className={styles.benefitCards}>
								{BENEFIT_CARDS.map((card) => {
									const on = card.id === "housing" ? draft.housingOffered : draft.mealsOffered
									return (
										<button
											key={card.id}
											type="button"
											className={styles.benefitCard}
											data-selected={on ? "true" : undefined}
											aria-pressed={on}
											disabled={isPending}
											onClick={() =>
												patch(
													card.id === "housing"
														? { housingOffered: !draft.housingOffered }
														: { mealsOffered: !draft.mealsOffered },
												)
											}
										>
											<span className={styles.benefitIcon} aria-hidden>
												<Icon name={card.icon} size={24} />
											</span>
											<span className={styles.benefitBody}>
												<span className={styles.benefitTitle}>{card.title}</span>
												<span className={styles.benefitText}>{card.body}</span>
												<span className={styles.benefitState}>
													<Icon
														name={on ? "system.success" : "action.more"}
														size={16}
														aria-hidden
													/>
													{on ? card.affirmative : "Not on our roles"}
												</span>
											</span>
										</button>
									)
								})}
							</div>
							<p className={styles.hint}>
								Say yes only where it is true on your roles. An honest no is worth more
								here than a maybe — seekers filter on both.
							</p>

							<div className={styles.roleLevel}>
								<h2 className={styles.roleLevelTitle}>
									Everything below belongs to a role, not to you
								</h2>
								<p className={styles.roleLevelBody}>
									These differ between your dock crew and your kitchen, so they are
									captured on each role rather than once here — you will meet the first
									set on the next-but-one step.
								</p>
								<ul className={styles.roleLevelList}>
									{ROLE_LEVEL_FACTS.map((fact) => (
										<li key={fact} className={styles.roleLevelItem}>
											<span className={styles.roleLevelIcon} aria-hidden>
												<Icon name="action.forward" size={14} />
											</span>
											{fact}
										</li>
									))}
								</ul>
							</div>

							{state.status === "error" ? (
								<p role="alert" className={styles.error}>
									{state.message}
								</p>
							) : null}

							<div className={styles.nav}>
								<Button
									variant="ghost"
									type="button"
									icon="action.back"
									onClick={() => goTo("identity")}
									disabled={isPending}
								>
									Back
								</Button>
								<Button
									variant="primary"
									type="submit"
									icon="action.forward"
									disabled={isPending}
								>
									{isPending ? "Saving…" : "Save and continue"}
								</Button>
							</div>
							<button
								type="button"
								className={styles.leaveLink}
								onClick={handleSaveAndLeave}
								disabled={isPending}
							>
								Save and finish later
							</button>
						</form>

						<aside className={styles.rail} aria-label="Live preview of your profile">
							{livePreview}
						</aside>
					</div>
				) : null}

				{/* ── 4. THE SEEKER-FACING PREVIEW ───────────────────────────── */}
				{step === "preview" ? (
					<div className={styles.card}>
						<h1 className={styles.title} ref={headingRef} tabIndex={-1}>Your profile, from the other side</h1>
						<p className={styles.subtitle}>
							Nothing here is a mock-up. These are the components a seeker meets,
							carrying what you have entered.
						</p>

						{livePreview}

						<div className={styles.nav}>
							<Button
								variant="ghost"
								type="button"
								icon="action.back"
								onClick={() => goTo("story")}
								disabled={isPending}
							>
								Back
							</Button>
							<Button
								variant="primary"
								type="button"
								icon="action.forward"
								onClick={() => goTo("role")}
								disabled={isPending}
							>
								Draft my first role
							</Button>
						</div>
						<button
							type="button"
							className={styles.leaveLink}
							onClick={handleSaveAndLeave}
							disabled={isPending}
						>
							Save and finish later
						</button>
					</div>
				) : null}

				{/* ── 5. FIRST ROLE DRAFT ────────────────────────────────────── */}
				{step === "role" ? (
					<div className={styles.split}>
						<form className={styles.card} onSubmit={handleRoleSubmit}>
							<h1 className={styles.title} ref={headingRef} tabIndex={-1}>Your first role</h1>
							<p className={styles.subtitle}>
								Saved as a draft. Drafts cost nothing, take no applications, and are
								not discoverable — publishing is the step a plan buys.
							</p>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="roleTitle">
									Role title
								</label>
								<input
									id="roleTitle"
									className={styles.input}
									value={draft.roleTitle}
									onChange={(e) => patch({ roleTitle: e.target.value })}
									placeholder="e.g. Dock &amp; Paddle Crew"
									maxLength={200}
									required
									disabled={isPending}
								/>
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="roleCategory">
									Lane
								</label>
								<select
									id="roleCategory"
									className={styles.input}
									value={draft.roleCategory}
									onChange={(e) =>
										patch({ roleCategory: e.target.value as MarketplaceLane | "" })
									}
									required
									disabled={isPending}
								>
									<option value="">Choose a lane</option>
									{LANES.map((lane) => (
										<option key={lane.id} value={lane.id}>
											{lane.label}
										</option>
									))}
								</select>
							</div>

							<div className={styles.field}>
								<label className={styles.label} htmlFor="roleSummary">
									What the work is
								</label>
								<textarea
									id="roleSummary"
									className={styles.textarea}
									rows={5}
									value={draft.roleSummary}
									onChange={(e) => patch({ roleSummary: e.target.value })}
									placeholder="A day on this role, start to finish."
									disabled={isPending}
								/>
							</div>

							<div className={styles.pairRow}>
								<div className={styles.field}>
									<label className={styles.label} htmlFor="rolePayMin">
										Pay from
									</label>
									<input
										id="rolePayMin"
										className={styles.input}
										inputMode="decimal"
										value={draft.rolePayMin}
										onChange={(e) => patch({ rolePayMin: e.target.value })}
										placeholder="21"
										disabled={isPending}
									/>
								</div>
								<div className={styles.field}>
									<label className={styles.label} htmlFor="rolePayMax">
										Pay to <span className={styles.optional}>(optional)</span>
									</label>
									<input
										id="rolePayMax"
										className={styles.input}
										inputMode="decimal"
										value={draft.rolePayMax}
										onChange={(e) => patch({ rolePayMax: e.target.value })}
										placeholder="25"
										disabled={isPending}
									/>
								</div>
								<div className={styles.field}>
									<label className={styles.label} htmlFor="rolePayPeriod">
										Per
									</label>
									<select
										id="rolePayPeriod"
										className={styles.input}
										value={draft.rolePayPeriod}
										onChange={(e) =>
											patch({ rolePayPeriod: e.target.value as CompensationUnit })
										}
										disabled={isPending}
									>
										{PAY_PERIODS.map((period) => (
											<option key={period.id} value={period.id}>
												{period.label}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className={styles.pairRow}>
								<div className={styles.field}>
									<label className={styles.label} htmlFor="roleStart">
										Starts <span className={styles.optional}>(optional)</span>
									</label>
									<input
										id="roleStart"
										type="date"
										className={styles.input}
										value={draft.roleStart}
										onChange={(e) => patch({ roleStart: e.target.value })}
										disabled={isPending}
									/>
								</div>
								<div className={styles.field}>
									<label className={styles.label} htmlFor="roleEnd">
										Ends <span className={styles.optional}>(optional)</span>
									</label>
									<input
										id="roleEnd"
										type="date"
										className={styles.input}
										value={draft.roleEnd}
										onChange={(e) => patch({ roleEnd: e.target.value })}
										disabled={isPending}
									/>
								</div>
							</div>

							<div className={styles.field}>
								<span className={styles.label} id="cover-label">
									Cover photo <span className={styles.optional}>(optional)</span>
								</span>
								<div className={styles.logoRow}>
									<span className={styles.coverFrame} aria-hidden>
										{draft.roleCoverUrl ? (
											<Image
												className={styles.logoImg}
												src={draft.roleCoverUrl}
												alt=""
												fill
												sizes="128px"
											/>
										) : (
											<Icon name="nav.photos" size={22} />
										)}
									</span>
									<input
										ref={coverInputRef}
										id="coverFile"
										type="file"
										accept="image/jpeg,image/png,image/webp"
										className={styles.fileInput}
										aria-labelledby="cover-label"
										onChange={(e) => {
											const file = e.target.files?.[0]
											if (file) handleCoverFile(file)
											e.target.value = ""
										}}
										disabled={isPending}
									/>
									<Button
										variant="ghost"
										type="button"
										onClick={() => coverInputRef.current?.click()}
										disabled={isPending}
									>
										{uploadingCover
											? "Uploading…"
											: draft.roleCoverUrl
												? "Replace cover"
												: "Upload a cover"}
									</Button>
								</div>
								<p className={styles.hint}>
									This is also your employer profile&apos;s cover band — the public
									profile takes it from your first role, so there is one photograph
									doing both jobs.
								</p>
							</div>

							<div className={styles.benefitCards}>
								<button
									type="button"
									className={styles.benefitCard}
									data-selected={draft.roleHousingIncluded ? "true" : undefined}
									aria-pressed={draft.roleHousingIncluded}
									disabled={isPending}
									onClick={() => patch({ roleHousingIncluded: !draft.roleHousingIncluded })}
								>
									<span className={styles.benefitIcon} aria-hidden>
										<Icon name="benefit.housing" size={24} />
									</span>
									<span className={styles.benefitBody}>
										<span className={styles.benefitTitle}>Housing on this role</span>
										<span className={styles.benefitState}>
											{draft.roleHousingIncluded ? "Included" : "Not included"}
										</span>
									</span>
								</button>
								<button
									type="button"
									className={styles.benefitCard}
									data-selected={draft.roleMealsIncluded ? "true" : undefined}
									aria-pressed={draft.roleMealsIncluded}
									disabled={isPending}
									onClick={() => patch({ roleMealsIncluded: !draft.roleMealsIncluded })}
								>
									<span className={styles.benefitIcon} aria-hidden>
										<Icon name="benefit.meals" size={24} />
									</span>
									<span className={styles.benefitBody}>
										<span className={styles.benefitTitle}>Meals on this role</span>
										<span className={styles.benefitState}>
											{draft.roleMealsIncluded ? "Included" : "Not included"}
										</span>
									</span>
								</button>
							</div>

							{state.status === "error" ? (
								<p role="alert" className={styles.error}>
									{state.message}
								</p>
							) : null}

							<div className={styles.nav}>
								<Button
									variant="ghost"
									type="button"
									icon="action.back"
									onClick={() => goTo("preview")}
									disabled={isPending}
								>
									Back
								</Button>
								<Button
									variant="primary"
									type="submit"
									icon="action.forward"
									disabled={isPending || draft.roleTitle.trim() === "" || draft.roleCategory === ""}
								>
									{isPending ? "Saving draft…" : "Save draft and open my workspace"}
								</Button>
							</div>
							<p className={styles.reassure}>
								You can add photos, schedules, gear and certifications to this role in
								the composer — nothing here is your last chance to say it.
							</p>
						</form>

						<aside className={styles.rail} aria-label="Live preview of your role">
							<div className={styles.rolePreview}>
								<h2 className={styles.railTitle}>How this role appears in Seek and Swipe</h2>
								{roleCard ? (
									<>
										{/* Inert: the LOCKED DiscoveryCard, with no live row behind it. */}
										<div className={styles.preview} inert aria-label="Role card preview">
											<DiscoveryCard
												data={roleCard}
												surface="discovery_feed"
												imageLoading="eager"
												onApply={noop}
												onSave={noop}
												onSkip={noop}
												onOpen={noop}
											/>
										</div>

										<dl className={styles.detailPreview} aria-label="Role detail preview">
											<div className={styles.detailRow}>
												<dt>Housing</dt>
												<dd>{draft.roleHousingIncluded ? "Included" : "Not included"}</dd>
											</div>
											<div className={styles.detailRow}>
												<dt>Meals</dt>
												<dd>{draft.roleMealsIncluded ? "Included" : "Not included"}</dd>
											</div>
											<div className={styles.detailRow}>
												<dt>Pay</dt>
												<dd>{roleCard.triad.pay}</dd>
											</div>
											{draft.roleSummary.trim() ? (
												<div className={styles.detailRow}>
													<dt>The work</dt>
													<dd>{draft.roleSummary.trim()}</dd>
												</div>
											) : null}
										</dl>
									</>
								) : (
									<p className={styles.hint}>
										Add a title, a lane and at least one pay figure and your card
										appears here, exactly as a seeker sees it.
									</p>
								)}
							</div>
						</aside>
					</div>
				) : null}

				{/* Always reachable: what is still missing, without leaving the step. */}
				{step !== "welcome" && gaps.length > 0 ? (
					<p className={styles.gapCount}>
						{gaps.length === 1
							? "1 thing on your profile is still blank."
							: `${gaps.length} things on your profile are still blank.`}{" "}
						None of them block you.
					</p>
				) : null}
			</div>

			<PopupShell
				open={mobilePreviewOpen}
				onClose={() => setMobilePreviewOpen(false)}
				title="What you're building"
				headerIcon={<Icon name="nav.photos" size={24} aria-hidden />}
				size="wide"
				closeLabel="Close preview"
			>
				<DemoEmployerPreview headingLevel="h3" />
			</PopupShell>
		</main>
	)
}
