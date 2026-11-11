// How Clerk's prebuilt screens (sign-in, sign-up, the user button and the user profile) look
// and read. The root layout spreads `clerkProviderProps` onto <ClerkProvider>.
//
// Every color is a CSS variable from tokens.css, so Clerk's components follow the light and dark
// themes (the device setting, or data-theme) exactly as our own components do.
import type { ClerkProvider } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

type ProviderProps = ComponentProps<typeof ClerkProvider>;
export type ClerkAppearance = NonNullable<ProviderProps['appearance']>;
export type ClerkLocalization = NonNullable<ProviderProps['localization']>;

const sans = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif';
const pill = { borderRadius: '9999px' } as const;
/** 44 px touch targets (product spec section 22). */
const target = { minHeight: '2.75rem' } as const;

export const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--ee-primary)',
    colorPrimaryForeground: 'var(--ee-on-primary)',
    colorDanger: 'var(--ee-danger)',
    colorSuccess: 'var(--ee-success)',
    colorWarning: 'var(--ee-warning)',
    colorNeutral: 'var(--ee-ink)',
    colorForeground: 'var(--ee-ink)',
    colorMuted: 'var(--ee-surface-2)',
    colorMutedForeground: 'var(--ee-muted)',
    colorBackground: 'var(--ee-surface)',
    colorInput: 'var(--ee-surface)',
    colorInputForeground: 'var(--ee-ink)',
    // Clerk draws its dividers and outlines at a fraction of this color's opacity.
    colorBorder: 'var(--ee-line-strong)',
    colorRing: 'var(--ee-focus)',
    colorModalBackdrop: 'var(--ee-scrim)',
    fontFamily: sans,
    fontFamilyButtons: sans,
    // 1rem is 16px. Inputs smaller than that make iOS Safari zoom the page on focus.
    fontSize: '1rem',
    borderRadius: '0.75rem',
  },
  options: {
    // Our pages show the Explore&Earn wordmark above the form.
    logoPlacement: 'none',
    socialButtonsVariant: 'blockButton',
  },
  elements: {
    cardBox: {
      boxShadow: 'var(--ee-shadow-card)',
      border: '1px solid var(--ee-line)',
      borderRadius: '1.25rem',
    },
    headerTitle: { fontSize: '1.3125rem', fontWeight: 800, letterSpacing: '-0.01em' },
    headerSubtitle: { color: 'var(--ee-muted)', fontSize: '1rem' },
    formButtonPrimary: { ...pill, ...target, fontWeight: 700, fontSize: '1rem' },
    socialButtonsBlockButton: { ...pill, ...target },
    // Clerk outlines inputs with a faint shadow from a more specific rule, and hides the outline;
    // ours are a 3:1 line (Field's controlClass) with the focus-token ring from tokens.css.
    formFieldInput: {
      ...target,
      fontSize: '1rem',
      boxShadow: '0 0 0 1px var(--ee-line-strong) !important',
      '&:focus-visible': {
        outline: '2px solid var(--ee-focus) !important',
        outlineOffset: '2px !important',
      },
    },
    footerActionLink: { color: 'var(--ee-ink)', fontWeight: 700, textDecoration: 'underline' },
    formFieldAction: { color: 'var(--ee-ink)', fontWeight: 700 },
    userButtonTrigger: { ...pill, ...target, minWidth: '2.75rem' },
    userButtonAvatarBox: { width: '2rem', height: '2rem' },
  },
} satisfies ClerkAppearance;

/** The product name is written exactly Explore&Earn (product spec section 21). */
export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Explore&Earn',
      subtitle: 'Welcome back. Pick up where you left off.',
    },
  },
  signUp: {
    start: {
      title: 'Create your Explore&Earn account',
      subtitle: 'Work worth going somewhere for.',
    },
  },
} satisfies ClerkLocalization;

export const clerkProviderProps = {
  appearance: clerkAppearance,
  localization: clerkLocalization,
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  afterSignOutUrl: '/',
} satisfies Partial<ProviderProps>;
