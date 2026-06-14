"use client";

import Link from "next/link";
import styles from "./StatusCard.module.css";

interface StatusCardProps {
	readonly type: "404" | "error";
	readonly digest?: string;
	readonly onReset?: () => void;
}

/* ── 404 landscape scene ─────────────────────────────────────────────────── */
function LandscapeScene() {
	return (
		<svg
			viewBox="0 0 420 360"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
			className={styles.scene}
		>
			<defs>
				<linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#c8dfe8" />
					<stop offset="100%" stopColor="#e8f2f6" />
				</linearGradient>
				<linearGradient id="ls-beam" x1="0.5" y1="0" x2="0.5" y2="1">
					<stop offset="0%" stopColor="#d8eeaa" stopOpacity="0.80" />
					<stop offset="60%" stopColor="#c8e090" stopOpacity="0.40" />
					<stop offset="100%" stopColor="#a8cc60" stopOpacity="0.05" />
				</linearGradient>
				<linearGradient id="ls-mtn1" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#8ba8be" />
					<stop offset="100%" stopColor="#a8c0d0" />
				</linearGradient>
				<linearGradient id="ls-mtn2" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#6a8ea0" />
					<stop offset="100%" stopColor="#8aaabb" />
				</linearGradient>
				<linearGradient id="ls-ground" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#4a6b3e" />
					<stop offset="100%" stopColor="#3a5530" />
				</linearGradient>
				<linearGradient id="ls-ufo-disc" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#9ac0d0" />
					<stop offset="100%" stopColor="#5a8eaa" />
				</linearGradient>
				<linearGradient id="ls-dome" x1="0.3" y1="0" x2="0.7" y2="1">
					<stop offset="0%" stopColor="#7db8cc" />
					<stop offset="100%" stopColor="#4a8aaa" />
				</linearGradient>
				<linearGradient id="ls-cabin" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#7a5534" />
					<stop offset="100%" stopColor="#5a3e24" />
				</linearGradient>
			</defs>

			{/* Sky */}
			<rect width="420" height="360" fill="url(#ls-sky)" />

			{/* Clouds */}
			<ellipse cx="60" cy="55" rx="38" ry="14" fill="white" opacity="0.70" />
			<ellipse cx="82" cy="48" rx="26" ry="18" fill="white" opacity="0.65" />
			<ellipse cx="42" cy="52" rx="20" ry="12" fill="white" opacity="0.55" />

			<ellipse cx="200" cy="38" rx="30" ry="11" fill="white" opacity="0.50" />
			<ellipse cx="218" cy="32" rx="18" ry="14" fill="white" opacity="0.45" />

			{/* Far mountains */}
			<path
				d="M-10 290 L50 185 L110 240 L170 160 L230 220 L290 135 L350 195 L410 148 L430 290 Z"
				fill="url(#ls-mtn1)"
				opacity="0.55"
			/>
			{/* Snow caps */}
			<path d="M170 160 L152 200 L188 200 Z" fill="white" opacity="0.65" />
			<path d="M290 135 L274 172 L306 172 Z" fill="white" opacity="0.55" />

			{/* Mid mountains */}
			<path
				d="M-10 310 L40 240 L100 275 L155 210 L210 260 L260 205 L315 250 L370 215 L430 265 L430 310 Z"
				fill="url(#ls-mtn2)"
				opacity="0.75"
			/>
			<path d="M155 210 L140 245 L170 245 Z" fill="white" opacity="0.50" />
			<path d="M260 205 L247 238 L273 238 Z" fill="white" opacity="0.45" />

			{/* Lake / river */}
			<ellipse cx="175" cy="315" rx="75" ry="9" fill="#8ab8cc" opacity="0.55" />
			<ellipse cx="175" cy="314" rx="60" ry="5" fill="#9ac8dc" opacity="0.40" />

			{/* Ground / meadow */}
			<path
				d="M-10 320 Q100 308 210 315 Q300 320 430 312 L430 360 L-10 360 Z"
				fill="url(#ls-ground)"
			/>
			<path
				d="M-10 338 Q120 330 210 335 Q310 340 430 332 L430 360 L-10 360 Z"
				fill="#3a5a30"
				opacity="0.6"
			/>

			{/* Cabin */}
			{/* Body */}
			<rect x="280" y="280" width="68" height="48" rx="2" fill="url(#ls-cabin)" />
			{/* Roof */}
			<path d="M272 282 L314 256 L356 282 Z" fill="#4a3020" />
			{/* Roof overhang shadow */}
			<path d="M272 282 L314 258 L356 282 L356 285 L272 285 Z" fill="#3a2518" opacity="0.4" />
			{/* Windows — warm glow */}
			<rect x="288" y="292" width="14" height="12" rx="1" fill="#f8e090" opacity="0.85" />
			<rect x="322" y="292" width="14" height="12" rx="1" fill="#f8e090" opacity="0.85" />
			{/* Window cross */}
			<line x1="295" y1="292" x2="295" y2="304" stroke="#c8aa60" strokeWidth="0.8" opacity="0.6" />
			<line x1="288" y1="298" x2="302" y2="298" stroke="#c8aa60" strokeWidth="0.8" opacity="0.6" />
			<line x1="329" y1="292" x2="329" y2="304" stroke="#c8aa60" strokeWidth="0.8" opacity="0.6" />
			<line x1="322" y1="298" x2="336" y2="298" stroke="#c8aa60" strokeWidth="0.8" opacity="0.6" />
			{/* Door */}
			<rect x="305" y="305" width="18" height="23" rx="1" fill="#3a2518" />
			{/* Chimney */}
			<rect x="334" y="256" width="10" height="22" rx="1" fill="#5a4030" />
			{/* Smoke */}
			<path d="M339 254 Q342 246 338 240 Q334 234 338 228" fill="none" stroke="#c8c0b0" strokeWidth="2" strokeLinecap="round" opacity="0.55" className={styles.smoke} />
			<path d="M342 256 Q346 246 342 238 Q338 230 342 222" fill="none" stroke="#c8c0b0" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" className={styles.smoke2} />

			{/* Pine trees — right side */}
			<g opacity="0.85">
				{/* Tree 1 */}
				<path d="M360 320 L373 282 L386 320 Z" fill="#2a4a22" />
				<path d="M362 308 L373 274 L384 308 Z" fill="#3a5a30" />
				<rect x="370" y="320" width="6" height="10" rx="1" fill="#5a3e24" />
				{/* Tree 2 */}
				<path d="M375 325 L386 293 L397 325 Z" fill="#243e1e" />
				<path d="M377 314 L386 287 L395 314 Z" fill="#2a4a22" />
				<rect x="383" y="325" width="6" height="8" rx="1" fill="#5a3e24" />
				{/* Tree 3 */}
				<path d="M394 322 L403 296 L412 322 Z" fill="#2a4a22" />
				<rect x="400" y="322" width="6" height="8" rx="1" fill="#5a3e24" />
			</g>

			{/* Pine trees — left side */}
			<g opacity="0.75">
				<path d="M-10 330 L6 298 L22 330 Z" fill="#2a4a22" />
				<rect x="3" y="330" width="6" height="10" rx="1" fill="#5a3e24" />
				<path d="M14 328 L26 300 L38 328 Z" fill="#243e1e" />
				<path d="M16 318 L26 294 L36 318 Z" fill="#2a4a22" />
				<rect x="23" y="328" width="6" height="8" rx="1" fill="#5a3e24" />
			</g>

			{/* Sign post with arrow */}
			<rect x="232" y="308" width="4" height="30" rx="1" fill="#7a6040" />
			<path d="M210 314 L236 310 L236 322 L210 318 Z" fill="#8a7050" />
			<path d="M208 316 L212 312 L210 316 Z" fill="#8a7050" />

			{/* UFO */}
			<g className={styles.ufo}>
				{/* Glow */}
				<ellipse cx="298" cy="108" rx="52" ry="16" fill="rgba(200,220,140,0.20)" />
				{/* Disc */}
				<ellipse cx="298" cy="110" rx="50" ry="14" fill="url(#ls-ufo-disc)" />
				<ellipse cx="292" cy="106" rx="34" ry="7" fill="rgba(255,255,255,0.12)" />
				{/* Dome */}
				<path d="M264 104 Q298 66 332 104 Z" fill="url(#ls-dome)" />
				<path d="M272 101 Q290 76 312 101" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
				{/* Lights */}
				<circle cx="258" cy="114" r="4" fill="#f0c840" opacity="0.9" className={styles.light1} />
				<circle cx="274" cy="118" r="4.5" fill="#f8d858" opacity="0.9" className={styles.light2} />
				<circle cx="298" cy="120" r="5" fill="#f8d858" opacity="0.9" className={styles.light1} />
				<circle cx="322" cy="118" r="4.5" fill="#f8d858" opacity="0.9" className={styles.light2} />
				<circle cx="338" cy="114" r="4" fill="#f0c840" opacity="0.9" className={styles.light1} />
				{/* Alien */}
				<ellipse cx="298" cy="86" rx="9" ry="8" fill="#2c7a44" />
				<ellipse cx="293" cy="83" rx="3.5" ry="3" fill="#7de0a0" />
				<ellipse cx="303" cy="83" rx="3.5" ry="3" fill="#7de0a0" />
				<circle cx="293" cy="83" r="1.5" fill="#1a3828" />
				<circle cx="303" cy="83" r="1.5" fill="#1a3828" />
				<path d="M294 90 Q298 93 302 90" fill="none" stroke="#1a3828" strokeWidth="1.2" strokeLinecap="round" />
				{/* Peace hand */}
				<path d="M308 82 L312 78 M310 84 L316 82" stroke="#2c7a44" strokeWidth="1.5" strokeLinecap="round" />
				{/* Antenna */}
				<line x1="298" y1="78" x2="296" y2="68" stroke="#5a9ab0" strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="296" cy="66" r="2.5" fill="#f0c840" className={styles.light2} />
			</g>

			{/* Tractor beam */}
			<polygon
				points="298,122 252,280 344,280"
				fill="url(#ls-beam)"
				className={styles.beam}
			/>

			{/* Listing card being abducted */}
			<g className={styles.abducted}>
				<rect x="268" y="200" width="58" height="70" rx="4" fill="#F6F1E7" opacity="0.96" />
				<rect x="268" y="200" width="58" height="70" rx="4" fill="none" stroke="rgba(196,149,74,0.35)" strokeWidth="1" />
				{/* Mini landscape image area */}
				<rect x="272" y="204" width="50" height="28" rx="2" fill="#8abacc" />
				{/* Mountain sketch in image */}
				<path d="M274 230 L282 216 L290 224 L298 210 L306 220 L314 212 L320 230 Z" fill="#4a7090" opacity="0.6" />
				<path d="M274 230 L286 222 L294 228 L304 218 L312 226 L320 230 Z" fill="#3a8050" opacity="0.5" />
				{/* Card title */}
				<rect x="274" y="237" width="40" height="5" rx="2" fill="#c4954a" opacity="0.7" />
				{/* Stars */}
				<text x="275" y="250" fontSize="6" fill="#f0c840">★★★★</text>
				<text x="299" y="250" fontSize="6" fill="#c8b870" opacity="0.5">★</text>
				{/* Meta text lines */}
				<rect x="274" y="254" width="32" height="3" rx="1" fill="rgba(23,19,13,0.15)" />
				<rect x="274" y="260" width="24" height="3" rx="1" fill="rgba(23,19,13,0.10)" />
			</g>

			{/* Sparkle stars around beam */}
			<g className={styles.sparkle} opacity="0.7">
				<path d="M252 185 L254 179 L256 185 L262 187 L256 189 L254 195 L252 189 L246 187 Z" fill="#f0c840" />
				<path d="M340 210 L341.5 205 L343 210 L348 211.5 L343 213 L341.5 218 L340 213 L335 211.5 Z" fill="#f0c840" />
				<path d="M260 230 L261 226 L262 230 L266 231 L262 232 L261 236 L260 232 L256 231 Z" fill="#c4954a" />
			</g>
		</svg>
	);
}

/* ── Error cosmic scene ───────────────────────────────────────────────────── */
function CosmicScene() {
	return (
		<svg
			viewBox="0 0 420 360"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
			className={styles.scene}
		>
			<defs>
				<radialGradient id="cs-sky" cx="50%" cy="40%" r="60%">
					<stop offset="0%" stopColor="#1a2a4a" />
					<stop offset="100%" stopColor="#0d1828" />
				</radialGradient>
				<linearGradient id="cs-beam" x1="0.5" y1="0" x2="0.5" y2="1">
					<stop offset="0%" stopColor="#d4a558" stopOpacity="0.65" />
					<stop offset="100%" stopColor="#c4954a" stopOpacity="0.04" />
				</linearGradient>
				<linearGradient id="cs-disc" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#3a7d96" />
					<stop offset="100%" stopColor="#1c4d62" />
				</linearGradient>
				<linearGradient id="cs-dome" x1="0.3" y1="0" x2="0.7" y2="1">
					<stop offset="0%" stopColor="#5ba3be" />
					<stop offset="100%" stopColor="#1a4557" />
				</linearGradient>
			</defs>
			<rect width="420" height="360" fill="url(#cs-sky)" />
			{/* Stars */}
			<circle cx="22" cy="18" r="1.2" fill="white" opacity="0.85" className={styles.star1} />
			<circle cx="68" cy="32" r="0.9" fill="white" opacity="0.6" className={styles.star2} />
			<circle cx="130" cy="14" r="1.5" fill="#e8c97a" opacity="0.8" className={styles.star3} />
			<circle cx="200" cy="22" r="0.8" fill="white" opacity="0.7" />
			<circle cx="260" cy="11" r="1.3" fill="white" opacity="0.9" className={styles.star1} />
			<circle cx="330" cy="28" r="0.9" fill="#e8c97a" opacity="0.65" className={styles.star2} />
			<circle cx="395" cy="16" r="1.1" fill="white" opacity="0.8" className={styles.star3} />
			<circle cx="14" cy="52" r="0.8" fill="white" opacity="0.55" />
			<circle cx="55" cy="80" r="1.2" fill="white" opacity="0.45" className={styles.star2} />
			<circle cx="380" cy="65" r="0.9" fill="white" opacity="0.6" className={styles.star3} />
			<circle cx="404" cy="82" r="1.2" fill="#e8c97a" opacity="0.55" className={styles.star1} />
			<circle cx="110" cy="60" r="0.8" fill="white" opacity="0.5" />
			<circle cx="320" cy="55" r="1.0" fill="white" opacity="0.6" className={styles.star2} />
			<circle cx="170" cy="45" r="1.3" fill="#e8c97a" opacity="0.7" className={styles.star3} />
			{/* UFO glow */}
			<ellipse cx="210" cy="115" rx="65" ry="18" fill="rgba(196,149,74,0.15)" />
			{/* Beam */}
			<polygon points="210,128 164,300 256,300" fill="url(#cs-beam)" className={styles.beam} />
			<polygon points="210,130 196,300 224,300" fill="rgba(196,149,74,0.12)" className={styles.beam} />
			{/* Lightning in beam */}
			<g className={styles.abducted}>
				<polygon points="210,178 198,208 207,208 205,232 218,200 210,200" fill="#f0d060" opacity="0.9" />
				<polygon points="210,178 199,208 208,208 206,232 217,200 209,200" fill="white" opacity="0.3" />
			</g>
			{/* UFO */}
			<g className={styles.ufo}>
				<ellipse cx="210" cy="122" rx="55" ry="15" fill="url(#cs-disc)" />
				<ellipse cx="205" cy="118" rx="38" ry="8" fill="rgba(255,255,255,0.09)" />
				<path d="M172 116 Q210 72 248 116 Z" fill="url(#cs-dome)" />
				<path d="M180 113 Q202 80 230 113" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="168" cy="125" r="4" fill="#c4954a" opacity="0.9" className={styles.light1} />
				<circle cx="186" cy="130" r="5" fill="#f0d060" opacity="0.9" className={styles.light2} />
				<circle cx="210" cy="132" r="5.5" fill="#f0d060" opacity="0.9" className={styles.light1} />
				<circle cx="234" cy="130" r="5" fill="#f0d060" opacity="0.9" className={styles.light2} />
				<circle cx="252" cy="125" r="4" fill="#c4954a" opacity="0.9" className={styles.light1} />
				<ellipse cx="210" cy="94" rx="9" ry="8" fill="#2c6b44" />
				<ellipse cx="205.5" cy="91" rx="3.5" ry="3" fill="#7de0a0" />
				<ellipse cx="214.5" cy="91" rx="3.5" ry="3" fill="#7de0a0" />
				<circle cx="205.5" cy="91" r="1.5" fill="#1a3828" />
				<circle cx="214.5" cy="91" r="1.5" fill="#1a3828" />
				<path d="M206 97 Q210 100 214 97" fill="none" stroke="#1a3828" strokeWidth="1.2" strokeLinecap="round" />
				<line x1="210" y1="86" x2="208" y2="74" stroke="#3a7d96" strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="208" cy="72" r="2.5" fill="#c4954a" className={styles.light2} />
			</g>
		</svg>
	);
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function StatusCard({ type, digest, onReset }: StatusCardProps) {
	const is404 = type === "404";

	return (
		<div className={styles.page}>
			{/* Decorative corner marks */}
			<span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden />
			<span className={`${styles.corner} ${styles.cornerTR}`} aria-hidden />
			<span className={`${styles.corner} ${styles.cornerBL}`} aria-hidden />
			<span className={`${styles.corner} ${styles.cornerBR}`} aria-hidden />

			<div className={styles.inner}>
				{/* Left / top: content */}
				<div className={styles.content}>
					{/* Logo */}
					<div className={styles.logo} aria-hidden>
						<svg viewBox="0 0 80 32" className={styles.logoSvg}>
							{/* Mountain + trees sketch */}
							<path d="M8 26 L18 10 L28 20 L35 6 L42 18 L50 4 L58 16 L68 26 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
							<path d="M2 26 L78 26" stroke="currentColor" strokeWidth="1" opacity="0.4" />
							<path d="M14 26 L17 22 L20 26" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
							<path d="M60 26 L63 21 L66 26" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
						</svg>
					</div>
					<p className={styles.logoLabel}>explore&amp;earn</p>
					<p className={styles.logoTagline}>Seek More. Earn More.</p>

					<div className={styles.divider} aria-hidden />

					{/* 404 number */}
					{is404 && <p className={styles.bigNumber} aria-hidden>404</p>}

					{/* Heading */}
					<h1 className={styles.heading}>
						{is404
							? "Uh-oh... aliens stole this page."
							: "Something went sideways in the cosmos."}
					</h1>
					<div className={styles.headingUnderline} aria-hidden />

					{/* Body */}
					<p className={styles.body}>
						<span className={styles.asterisk}>*</span>
						{is404
							? "We're negotiating to get it back. In the meantime, head somewhere a little less intergalactic."
							: "Our best earthling engineers have been notified. Most anomalies resolve themselves — try again or head home."}
					</p>

					{/* Last seen badge */}
					{is404 && (
						<div className={styles.lastSeen}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
								<circle cx="8" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
								<path d="M8 10.5 L8 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
								<ellipse cx="8" cy="14.5" rx="3" ry="1" stroke="currentColor" strokeWidth="1" opacity="0.4" />
							</svg>
							<span>Last seen near the Orion Trail.</span>
							<span className={styles.sparkleSmall}>✦</span>
						</div>
					)}

					{digest && (
						<p className={styles.digest}>Incident ID: {digest}</p>
					)}

					{/* Buttons */}
					<div className={styles.actions}>
						<Link className={styles.btnHome} href="/">
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
								<path d="M2 8 L8 2.5 L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M4 6.5 L4 13 L12 13 L12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M6.5 13 L6.5 9.5 L9.5 9.5 L9.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							Go Home
						</Link>
						{onReset ? (
							<button type="button" className={styles.btnExplore} onClick={onReset}>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
									<circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
									<path d="M8 2.5 L8 4 M8 12 L8 13.5 M2.5 8 L4 8 M12 8 L13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
									<circle cx="8" cy="8" r="1.5" fill="currentColor" />
								</svg>
								Try Again
							</button>
						) : (
							<Link className={styles.btnExplore} href="/seek">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
									<circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
									<path d="M8 2.5 L8 4 M8 12 L8 13.5 M2.5 8 L4 8 M12 8 L13.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
									<circle cx="8" cy="8" r="1.5" fill="currentColor" />
								</svg>
								Back to Explore
							</Link>
						)}
					</div>

					{/* Footer note */}
					<p className={styles.footerNote}>
						<span>🐄</span> No seekers, hosts, or opportunities were harmed. <span>🌿</span>
					</p>
				</div>

				{/* Right / bottom: illustration */}
				<div className={styles.illustration}>
					{is404 ? <LandscapeScene /> : <CosmicScene />}
				</div>
			</div>
		</div>
	);
}
