import Link from "next/link";

import styles from "./SiteFooter.module.css";

const FOOTER_COLUMNS = [
	{
		title: "Explore",
		// Categories are ATTRIBUTES, not products (redesign 2026-07-27): the
		// four category pages stay live for SEO under /jobs, reached through
		// one door here instead of four sibling rows that made farm/maritime/
		// remote/seasonal read as separate sites.
		links: [
			{ label: "Seek",  href: "/seek"  },
			{ label: "Swipe", href: "/swipe" },
			{ label: "Map",   href: "/map"   },
			{ label: "Browse by category", href: "/jobs" },
		],
	},
	{
		title: "Hosts",
		links: [
			{ label: "For hosts",        href: "/for-hosts"          },
			{ label: "Pricing",          href: "/for-hosts#pricing"  },
		],
	},
	{
		title: "Company",
		links: [
			{ label: "About",       href: "/about"     },
			{ label: "Community",   href: "/community" },
			{ label: "Field Guide", href: "/blog"      },
			{ label: "FAQ",         href: "/faq"       },
		],
	},
	{
		title: "Legal",
		links: [
			{ label: "Terms",   href: "/terms"   },
			{ label: "Privacy", href: "/privacy" },
			{ label: "Cookies", href: "/cookies" },
			{ label: "Refunds", href: "/refunds" },
		],
	},
] as const;

export function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<div className={styles.inner}>

				{/* Row 1: link columns */}
				<nav className={styles.columns} aria-label="Footer navigation">
					{FOOTER_COLUMNS.map((col) => (
						<div key={col.title} className={styles.column}>
							<p className={styles.columnTitle}>{col.title}</p>
							<ul className={styles.columnList} role="list">
								{col.links.map((l) => (
									<li key={l.href}>
										<Link className={styles.columnLink} href={l.href}>{l.label}</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</nav>

				{/* Row 2: social icons + wordmark/copyright */}
				<div className={styles.baseRow}>
					<div className={styles.social} aria-label="Social links">
						<a href="https://facebook.com/exploreandearn" className={styles.socialLink} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.277h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
							</svg>
						</a>
						<a href="https://instagram.com/exploreandearn" className={styles.socialLink} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
								<circle cx="12" cy="12" r="4"/>
								<circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
							</svg>
						</a>
						<a href="https://threads.net/@exploreandearn" className={styles.socialLink} target="_blank" rel="noopener noreferrer" aria-label="Threads">
							<svg width="18" height="18" viewBox="0 0 192 192" fill="currentColor" aria-hidden="true">
								<path d="M141.537 88.988a66 66 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.232c8.25.053 14.476 2.452 18.502 7.13 2.932 3.405 4.893 8.11 5.864 14.05-7.314-1.242-15.224-1.623-23.68-1.14C79.082 83.68 65.08 92.18 65.08 108.34c0 .36.01.72.03 1.083.54 16.59 14.888 26.31 32.614 26.31.285 0 .57-.003.855-.01 11.36-.32 21.095-4.37 27.472-11.4 5.51-6.063 9.003-14.028 10.565-24.265.94.6 1.73 1.174 2.374 1.705 4.953 4.109 7.47 9.636 7.47 16.408 0 20.24-15.59 40.168-43.71 40.168-20.61 0-34.898-8.716-44.6-27.44C53.51 118.89 49.95 106.9 49.95 96c0-39.26 25.575-60.036 62.024-60.036 9.748 0 18.88 1.96 27.138 5.827 8.02 3.748 15.248 9.332 20.48 16.08l.01.014a5.01 5.01 0 0 0 7.874-6.193c-6.354-8.094-15.14-14.786-25.33-19.376C131.42 27.22 120.4 24.79 108.95 24.79 65.39 24.79 32 52.44 32 96c0 13.096 4.005 27.063 11.27 39.396 9.874 16.795 25.7 27.164 45.748 29.38C90.57 164.99 92.03 165 93.5 165c31.63 0 52.3-21.04 52.3-51.498 0-11.046-3.64-20.18-10.263-25.514z"/>
							</svg>
						</a>
					</div>

					<p className={styles.copy}>explore&amp;earn © 2026</p>
				</div>

			</div>
		</footer>
	);
}
