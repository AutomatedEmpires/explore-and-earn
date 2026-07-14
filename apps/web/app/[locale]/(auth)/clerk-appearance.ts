/**
 * Clerk appearance — maps the hosted auth widget onto the Explore&Earn
 * "Adventure Paper & Sky" token system so sign-in/up feel like the product,
 * not a generic Clerk default. Values reference semantic tokens (resolved in
 * the cascade), so a palette change updates auth automatically.
 *
 * Typed structurally (no `@clerk/types` import) — the `appearance` prop on
 * <SignIn>/<SignUp> validates the shape at the call site.
 */
export const clerkAppearance = {
	variables: {
		colorPrimary: "var(--color-cta)",
		colorText: "var(--text-primary)",
		colorTextSecondary: "var(--text-secondary)",
		colorBackground: "var(--color-surface-raised)",
		colorInputBackground: "var(--field-bg)",
		colorInputText: "var(--text-primary)",
		colorDanger: "var(--status-error-fg)",
		colorSuccess: "var(--status-success-fg)",
		borderRadius: "var(--radius-input)",
		fontFamily: "var(--font-ui)",
	},
	elements: {
		card: {
			boxShadow: "var(--elevation-overlay)",
			border: "1px solid var(--border-soft)",
			borderRadius: "var(--radius-modal)",
		},
		headerTitle: { fontFamily: "var(--font-display)", fontWeight: "400" },
		socialButtonsBlockButton: { borderRadius: "var(--radius-button)" },
		formButtonPrimary: {
			textTransform: "none",
			fontWeight: "600",
			borderRadius: "var(--radius-button)",
		},
		formFieldInput: { borderRadius: "var(--radius-input)" },
		footerActionLink: { color: "var(--color-cta)" },
	},
} as const;
