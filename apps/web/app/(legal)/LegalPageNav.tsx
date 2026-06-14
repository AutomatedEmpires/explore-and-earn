"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./LegalPageNav.module.css";

const PAGES: ReadonlyArray<{ href: string; label: string; icon: IconKey; accent: string }> = [
	{ href: "/about",   label: "About",   icon: "category.mix",        accent: "#c4954a" },
	{ href: "/terms",   label: "Terms",   icon: "trust.verified_host", accent: "#2f667a" },
	{ href: "/privacy", label: "Privacy", icon: "nav.profile",         accent: "#185848" },
	{ href: "/cookies", label: "Cookies", icon: "nav.seek",            accent: "#8a6a3a" },
];

const SECTIONS: Record<string, ReadonlyArray<{ id: string; label: string }>> = {
	"/about": [
		{ id: "mission",         label: "Who we are"       },
		{ id: "three-questions", label: "The 3 questions"  },
		{ id: "categories",      label: "Categories"       },
		{ id: "how-it-works",    label: "How it works"     },
		{ id: "why",             label: "Why we built it"  },
		{ id: "contact",         label: "Contact"          },
	],
	"/terms": [
		{ id: "what-it-is",  label: "What it is"    },
		{ id: "accounts",    label: "Accounts"      },
		{ id: "billing",     label: "Billing"       },
		{ id: "conduct",     label: "Conduct"       },
		{ id: "content",     label: "Your content"  },
		{ id: "liability",   label: "Liability"     },
		{ id: "contact",     label: "Contact"       },
	],
	"/privacy": [
		{ id: "what-we-collect", label: "What we collect" },
		{ id: "how-we-use-it",   label: "How we use it"   },
		{ id: "who-processes",   label: "Who processes"   },
		{ id: "no-sale",         label: "No data sales"   },
		{ id: "retention",       label: "Retention"       },
		{ id: "your-rights",     label: "Your rights"     },
		{ id: "contact",         label: "Contact"         },
	],
	"/cookies": [
		{ id: "what-we-set",             label: "What we set"         },
		{ id: "essential-vs-analytics",  label: "Essential vs opt-in" },
		{ id: "opt-out",                 label: "Opt out"             },
		{ id: "contact",                 label: "Contact"             },
	],
};

export function LegalPageNav() {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	const close = useCallback(() => setOpen(false), []);
	const toggle = useCallback(() => setOpen((v) => !v), []);

	const sections = SECTIONS[pathname] ?? [];
	const currentPage = PAGES.find((p) => p.href === pathname);

	return (
		<>
			{/* Backdrop */}
			{open && <div className={styles.backdrop} onClick={close} aria-hidden />}

			{/* Floating trigger */}
			<button
				type="button"
				className={styles.trigger}
				onClick={toggle}
				aria-expanded={open}
				aria-label="Page navigation"
			>
				<Icon name="nav.seek" size={20} aria-hidden />
				<span className={styles.triggerLabel}>Contents</span>
			</button>

			{/* Slide-up panel */}
			<div className={`${styles.panel} ${open ? styles.panelOpen : ""}`} aria-hidden={!open}>
				<div className={styles.panelHandle} />

				{/* Page tabs */}
				<p className={styles.panelSection}>Legal pages</p>
				<nav className={styles.pageTabs} aria-label="Legal pages">
					{PAGES.map((page) => {
						const active = pathname === page.href;
						return (
							<Link
								key={page.href}
								href={page.href}
								onClick={close}
								className={`${styles.pageTab} ${active ? styles.pageTabActive : ""}`}
								style={active ? { "--tab-accent": page.accent } as React.CSSProperties : undefined}
								aria-current={active ? "page" : undefined}
							>
								<Icon name={page.icon} size={20} aria-hidden />
								<span>{page.label}</span>
							</Link>
						);
					})}
				</nav>

				{/* In-page sections */}
				{sections.length > 0 && (
					<>
						<p className={styles.panelSection}>
							On this page
							{currentPage && <span style={{ color: currentPage.accent }}> — {currentPage.label}</span>}
						</p>
						<nav className={styles.sectionList} aria-label="Page sections">
							{sections.map((s) => (
								<a
									key={s.id}
									href={`#${s.id}`}
									className={styles.sectionLink}
									onClick={close}
								>
									<span className={styles.sectionDot} aria-hidden />
									{s.label}
								</a>
							))}
						</nav>
					</>
				)}
			</div>
		</>
	);
}
