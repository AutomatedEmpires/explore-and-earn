"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./ScopeShellNav.module.css";

/**
 * ScopeShellNav — the reusable secondary-navigation backbone for the
 * seeker / host / admin scopes (founder canon, 2026-07-13: "secondary nav is
 * TUCKED; NEVER a row of selectors at the bottom").
 *
 * Two postures from one API, switched purely in CSS (no JS resize listener):
 *   - **Desktop (≥1024px)** → a persistent LEFT rail fixed to the viewport
 *     height. The consuming shell offsets its content by {@link SCOPE_RAIL_WIDTH}.
 *   - **Mobile (<1024px)** → the rail is hidden; a top-left HAMBURGER opens a
 *     focus-trapped left drawer (Esc + backdrop close, scroll-locked,
 *     safe-area aware) with the same items.
 *
 * Self-contained: it owns its own drawer open-state and renders both the rail
 * and the hamburger, so a shell just drops `<ScopeShellNav … />` at the top of
 * its layout. Icons render through the `<Icon>` registry only (guardrail G30);
 * the hamburger is a CSS bar affordance, not an ad-hoc SVG.
 */

/** Fixed width (px) of the desktop left rail. Consuming shells should offset
 *  their content by this much at ≥1024px (e.g. `margin-inline-start`). */
export const SCOPE_RAIL_WIDTH = 240;

export interface ScopeNavItem {
	readonly href: string;
	readonly label: string;
	readonly icon: IconKey;
	/** Optional unread/pending count. `0` or absent renders no badge. */
	readonly badge?: number;
	/** Marks the current section (drives `aria-current` + the active lane). */
	readonly active?: boolean;
}

export interface ScopeShellNavProps {
	/** Uppercase scope label shown at the top of the rail/drawer (e.g. "Host"). */
	readonly scopeLabel: string;
	/** Primary section links for this scope. */
	readonly items: ReadonlyArray<ScopeNavItem>;
	/** Optional brand/logo node shown above the scope label. */
	readonly brand?: ReactNode;
	/** Optional signed-in user name, rendered in the pinned footer. */
	readonly userName?: string;
	/** Where the user row links (e.g. the profile/account route). */
	readonly userHref?: string;
	/** Optional avatar node for the user row. */
	readonly avatar?: ReactNode;
	/** Reference-y links pinned to the bottom (settings, help, billing…). */
	readonly footerItems?: ReadonlyArray<ScopeNavItem>;
	/** Accessible label for the hamburger. Defaults to `Open {scopeLabel} menu`. */
	readonly menuLabel?: string;
}

/**
 * Small open-state helper for callers that want to drive the drawer from
 * elsewhere. `ScopeShellNav` uses this internally, so most consumers never
 * need it — it's exported for shells that want an external trigger.
 */
export function useScopeNavDisclosure(initial = false) {
	const [open, setOpen] = useState(initial);
	const onOpen = useCallback(() => setOpen(true), []);
	const onClose = useCallback(() => setOpen(false), []);
	const onToggle = useCallback(() => setOpen((value) => !value), []);
	return { open, onOpen, onClose, onToggle } as const;
}

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function NavItem({
	item,
	onNavigate,
}: {
	readonly item: ScopeNavItem;
	readonly onNavigate?: () => void;
}) {
	const hasBadge = typeof item.badge === "number" && item.badge > 0;
	return (
		<a
			href={item.href}
			className={styles.navItem}
			data-active={item.active ? "true" : undefined}
			aria-current={item.active ? "page" : undefined}
			onClick={onNavigate}
		>
			<span className={styles.navIcon} aria-hidden>
				<Icon
					name={item.icon}
					size={24}
					weight={item.active ? "fill" : "regular"}
					aria-hidden
				/>
			</span>
			<span className={styles.navLabel}>{item.label}</span>
			{hasBadge ? (
				<span
					className={styles.badge}
					aria-label={`${item.badge} new`}
				>
					{item.badge! > 99 ? "99+" : item.badge}
				</span>
			) : null}
		</a>
	);
}

function UserRow({
	userName,
	userHref,
	avatar,
	onNavigate,
}: {
	readonly userName: string;
	readonly userHref?: string;
	readonly avatar?: ReactNode;
	readonly onNavigate?: () => void;
}) {
	const content = (
		<>
			<span className={styles.userAvatar} aria-hidden>
				{avatar ?? <Icon name="nav.profile" size={24} aria-hidden />}
			</span>
			<span className={styles.userMeta}>
				<span className={styles.userName}>{userName}</span>
				<span className={styles.userScope}>View profile</span>
			</span>
		</>
	);
	if (userHref) {
		return (
			<a href={userHref} className={styles.userRow} onClick={onNavigate}>
				{content}
			</a>
		);
	}
	return <div className={styles.userRow}>{content}</div>;
}

function NavList({
	items,
	onNavigate,
}: {
	readonly items: ReadonlyArray<ScopeNavItem>;
	readonly onNavigate?: () => void;
}) {
	return (
		<ul className={styles.navList}>
			{items.map((item) => (
				<li key={item.href}>
					<NavItem item={item} onNavigate={onNavigate} />
				</li>
			))}
		</ul>
	);
}

function ScopeHead({
	brand,
	scopeLabel,
}: {
	readonly brand?: ReactNode;
	readonly scopeLabel: string;
}) {
	return (
		<div className={styles.head}>
			{brand ? <div className={styles.brand}>{brand}</div> : null}
			<span className={styles.scopeLabel}>{scopeLabel}</span>
		</div>
	);
}

export function ScopeShellNav({
	scopeLabel,
	items,
	brand,
	userName,
	userHref,
	avatar,
	footerItems,
	menuLabel,
}: ScopeShellNavProps) {
	const { open, onOpen, onClose } = useScopeNavDisclosure(false);

	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);
	// Keep the portal mounted through the exit animation after `open` flips to
	// false; the focus trap / scroll lock still release the instant it closes.
	const [present, setPresent] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (open) {
			setPresent(true);
		}
	}, [open]);

	useEffect(() => {
		if (open || !present) {
			return;
		}
		// Closing: hold the portal for one exit cycle, then unmount. Duration is
		// read from the --motion-drawer token (0 under reduced motion) so timing
		// stays token-driven rather than a hard-coded magic number.
		let exitMs = 320;
		if (typeof window !== "undefined") {
			if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
				exitMs = 0;
			} else {
				const raw = getComputedStyle(document.documentElement)
					.getPropertyValue("--motion-drawer")
					.trim();
				const parsed = Number.parseFloat(raw);
				if (!Number.isNaN(parsed)) {
					exitMs = raw.endsWith("ms") ? parsed : parsed * 1000;
				}
			}
		}
		const timer = window.setTimeout(() => setPresent(false), exitMs);
		return () => window.clearTimeout(timer);
	}, [open, present]);

	useEffect(() => {
		if (!open || !panelRef.current) {
			return;
		}

		restoreFocusRef.current = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const focusables = () =>
			panel
				? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
				: [];
		focusables()[0]?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab") {
				return;
			}
			const items = focusables();
			if (items.length === 0) {
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		// Hide sibling body children from assistive tech so the drawer is the
		// only reachable region (ARIA modal-dialog spec).
		const hiddenRoots: Element[] = [];
		for (const child of Array.from(document.body.children)) {
			if (!child.contains(panel)) {
				child.setAttribute("aria-hidden", "true");
				hiddenRoots.push(child);
			}
		}

		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = previousOverflow;
			restoreFocusRef.current?.focus();
			for (const element of hiddenRoots) {
				element.removeAttribute("aria-hidden");
			}
		};
	}, [open, onClose]);

	const closing = !open;

	return (
		<>
			{/* Desktop: persistent left rail (hidden <1024px via CSS). */}
			<aside className={styles.rail}>
				<ScopeHead brand={brand} scopeLabel={scopeLabel} />
				<nav className={styles.railNav} aria-label={`${scopeLabel} sections`}>
					<NavList items={items} />
				</nav>
				<div className={styles.foot}>
					{footerItems && footerItems.length > 0 ? (
						<nav
							className={styles.footNav}
							aria-label={`${scopeLabel} account`}
						>
							<NavList items={footerItems} />
						</nav>
					) : null}
					{userName ? (
						<UserRow
							userName={userName}
							userHref={userHref}
							avatar={avatar}
						/>
					) : null}
				</div>
			</aside>

			{/* Mobile: hamburger trigger (hidden ≥1024px via CSS). */}
			<button
				type="button"
				className={styles.hamburger}
				aria-label={menuLabel ?? `Open ${scopeLabel} menu`}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={onOpen}
			>
				<span className={styles.hamburgerBars} aria-hidden>
					<span />
					<span />
					<span />
				</span>
			</button>

			{/* Mobile: slide-in left drawer, portaled to body at --z-overlay. */}
			{mounted && present
				? createPortal(
						<div
							className={`${styles.scrim}${closing ? ` ${styles.closing}` : ""}`}
							aria-hidden={closing || undefined}
							onClick={(event) => {
								if (!closing && event.target === event.currentTarget) {
									onClose();
								}
							}}
						>
							<div
								ref={panelRef}
								className={`${styles.drawer}${closing ? ` ${styles.closing}` : ""}`}
								role="dialog"
								aria-modal={true}
								aria-label={`${scopeLabel} navigation`}
							>
								<div className={styles.drawerHead}>
									<ScopeHead brand={brand} scopeLabel={scopeLabel} />
									<button
										type="button"
										className={styles.close}
										onClick={onClose}
										aria-label="Close menu"
									>
										<Icon name="action.close" size={20} aria-hidden />
									</button>
								</div>
								<nav
									className={styles.drawerNav}
									aria-label={`${scopeLabel} sections`}
								>
									<NavList items={items} onNavigate={onClose} />
								</nav>
								<div className={styles.foot}>
									{footerItems && footerItems.length > 0 ? (
										<nav
											className={styles.footNav}
											aria-label={`${scopeLabel} account`}
										>
											<NavList items={footerItems} onNavigate={onClose} />
										</nav>
									) : null}
									{userName ? (
										<UserRow
											userName={userName}
											userHref={userHref}
											avatar={avatar}
											onNavigate={onClose}
										/>
									) : null}
								</div>
							</div>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
