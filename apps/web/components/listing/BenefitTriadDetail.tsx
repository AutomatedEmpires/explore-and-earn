import type { CSSProperties } from "react"
import { Icon, type IconKey } from "@explore-and-earn/ui"
import { NOT_STATED_LABEL } from "@explore-and-earn/contracts"
import type { BenefitProvision, BenefitTriad } from "@explore-and-earn/contracts"

type BenefitSlot = "housing" | "meals" | "pay"

const BENEFIT_META: Record<
	BenefitSlot,
	{ readonly label: string; readonly icon: IconKey; readonly bg: string; readonly fg: string }
> = {
	housing: {
		label: "Housing",
		icon: "benefit.housing",
		bg: "var(--benefit-housing-bg)",
		fg: "var(--benefit-housing-fg)",
	},
	meals: {
		label: "Meals",
		icon: "benefit.meals",
		bg: "var(--benefit-meals-bg)",
		fg: "var(--benefit-meals-fg)",
	},
	pay: {
		label: "Pay",
		icon: "benefit.pay",
		bg: "var(--benefit-pay-bg)",
		fg: "var(--benefit-pay-fg)",
	},
}

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided: "Provided",
	partial: "Partial",
	not_provided: "Not provided",
	not_stated: NOT_STATED_LABEL,
}

const SLOT_ORDER: ReadonlyArray<BenefitSlot> = ["housing", "meals", "pay"]

const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
	gap: "var(--space-12)",
}

const headerRowStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "var(--space-8)",
}

const titleStyle: CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-card-size)",
	lineHeight: "var(--type-card-lh)",
}

const provisionStyle: CSSProperties = {
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-label-size)",
	lineHeight: "var(--type-label-lh)",
	letterSpacing: "var(--type-label-tracking)",
	textTransform: "uppercase",
}

const summaryStyle: CSSProperties = {
	margin: "0",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	lineHeight: "var(--type-body-lh)",
}

export function BenefitTriadDetail({ benefits }: { readonly benefits: BenefitTriad }) {
	return (
		<div style={gridStyle}>
			{SLOT_ORDER.map((slot) => {
				const meta = BENEFIT_META[slot]
				const info = benefits[slot]
				const tileStyle: CSSProperties = {
					display: "flex",
					flexDirection: "column",
					gap: "var(--space-8)",
					background: meta.bg,
					color: meta.fg,
					borderRadius: "var(--radius-cell)",
					padding: "var(--space-16)",
				}
				return (
					<section key={slot} aria-label={meta.label} style={tileStyle}>
						<div style={headerRowStyle}>
							<Icon aria-hidden name={meta.icon} size={24} />
							<span style={titleStyle}>{meta.label}</span>
						</div>
						<span style={provisionStyle}>{PROVISION_LABEL[info.provision]}</span>
						{info.summary ? <p style={summaryStyle}>{info.summary}</p> : null}
					</section>
				)
			})}
		</div>
	)
}
