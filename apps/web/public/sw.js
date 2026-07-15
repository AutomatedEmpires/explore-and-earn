/*
 * Explore & Earn — service worker (hand-rolled, dependency-free).
 *
 * Foundation for the installable PWA shell. Deliberately conservative so it can
 * NEVER serve one user's authed data to another and never masks a mutation:
 *
 *   • GET-only. Every non-GET (POST/PUT/PATCH/DELETE) passes straight through —
 *     mutations are never intercepted or cached.
 *   • Navigations → network-first, falling back to the offline page. Authed HTML
 *     is never written to the cache (avoids cross-user leakage on shared
 *     devices); only the static shell + offline page live in the cache.
 *   • GET /api/public/*  → stale-while-revalidate (fast + self-healing).
 *     Any OTHER /api/*    → network only, never cached (authed/dynamic).
 *   • Same-origin static assets (/_next/static, /icons, fonts, css, js) →
 *     cache-first (they are content-hashed / immutable).
 *   • Cloudinary images → bounded cache-first (heavy, repeat, public).
 *   • All other cross-origin (Clerk, Supabase, Sentry, PostHog, Mapbox tiles) →
 *     passthrough, so their own auth/caching is untouched.
 *
 * Bump CACHE_VERSION to invalidate every cache on the next activate.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `ee-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `ee-static-${CACHE_VERSION}`;
const API_CACHE = `ee-api-public-${CACHE_VERSION}`;
const IMAGE_CACHE = `ee-img-${CACHE_VERSION}`;

const OFFLINE_URL = "/offline.html";

// Minimal app shell precached at install so the offline page + brand icon always
// resolve without a network round-trip.
const SHELL_ASSETS = [
	OFFLINE_URL,
	"/icons/icon-192.png",
	"/icons/icon-512.png",
	"/manifest.webmanifest",
];

const IMAGE_CACHE_LIMIT = 60;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL_ASSETS))
			// Don't let one missing asset abort the whole install.
			.catch(() => undefined)
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	const keep = new Set([SHELL_CACHE, STATIC_CACHE, API_CACHE, IMAGE_CACHE]);
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
			)
			.then(() => self.clients.claim()),
	);
});

// Let the page trigger an immediate update (used by the registrar on new SW).
self.addEventListener("message", (event) => {
	if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/*
 * ── Web push (Lifecycle & Engagement Notification Engine) ───────────────────
 * Additive: everything below only runs for push events the user explicitly
 * opted into (PushManager.subscribe happens on the settings toggle, never on
 * load). Payloads are produced ONLY by the server's dispatcher from persisted
 * domain events and carry pre-rendered localized title/body plus a SAME-APP
 * path — no auth material, no message content beyond the rendered copy.
 */

/** Only rooted same-app paths may be opened from a notification click. */
function safeNotificationPath(path) {
	if (typeof path !== "string") return "/";
	if (!path.startsWith("/") || path.startsWith("//")) return "/";
	if (path.includes("://") || /[\r\n\\]/.test(path)) return "/";
	return path;
}

self.addEventListener("push", (event) => {
	let payload = null;
	try {
		payload = event.data ? event.data.json() : null;
	} catch {
		payload = null;
	}
	// No fabricated notifications: a push without a usable engine payload is
	// dropped, never replaced with invented copy.
	if (!payload || typeof payload.title !== "string" || payload.title.length === 0) {
		return;
	}
	const title = payload.title;
	const options = {
		body: typeof payload.body === "string" ? payload.body : "",
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-192.png",
		// Collapse: same tag (thread/entity) replaces instead of stacking.
		tag: typeof payload.tag === "string" && payload.tag ? payload.tag : undefined,
		data: { path: safeNotificationPath(payload.path) },
	};
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const path = safeNotificationPath(
		event.notification.data && event.notification.data.path,
	);
	const target = new URL(path, self.location.origin).href;
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windows) => {
				for (const client of windows) {
					// Reuse an existing app window when we can.
					if (client.url === target && "focus" in client) return client.focus();
				}
				for (const client of windows) {
					if ("navigate" in client && "focus" in client) {
						return client.navigate(target).then((c) => (c ? c.focus() : undefined));
					}
				}
				return self.clients.openWindow(target);
			})
			.catch(() => undefined),
	);
});

function isStaticAsset(url) {
	if (url.pathname.startsWith("/_next/static/")) return true;
	if (url.pathname.startsWith("/icons/")) return true;
	return /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|svg|gif|webp|avif|ico)$/i.test(
		url.pathname,
	);
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const network = fetch(request)
		.then((response) => {
			if (response && response.ok && response.type === "basic") {
				cache.put(request, response.clone());
			}
			return response;
		})
		.catch(() => undefined);
	return cached || network || fetch(request);
}

async function cacheFirst(request, cacheName, limit) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response && (response.ok || response.type === "opaque")) {
		cache.put(request, response.clone());
		if (limit) trimCache(cacheName, limit);
	}
	return response;
}

async function trimCache(cacheName, limit) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	if (keys.length <= limit) return;
	for (let i = 0; i < keys.length - limit; i++) {
		await cache.delete(keys[i]);
	}
}

async function handleNavigation(request) {
	try {
		// Network-first: authed pages must stay fresh and are never cached here.
		return await fetch(request);
	} catch {
		const cache = await caches.open(SHELL_CACHE);
		return (await cache.match(OFFLINE_URL)) || Response.error();
	}
}

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Never touch non-GET — mutations pass straight through, uncached.
	if (request.method !== "GET") return;
	// Range requests (media streaming) — let the browser handle directly.
	if (request.headers.has("range")) return;

	const url = new URL(request.url);
	const sameOrigin = url.origin === self.location.origin;

	// App-shell navigations (documents).
	if (request.mode === "navigate") {
		event.respondWith(handleNavigation(request));
		return;
	}

	if (sameOrigin) {
		// API: only the PUBLIC surface is cacheable; everything else is authed/
		// dynamic and must never be stored.
		if (url.pathname.startsWith("/api/")) {
			if (url.pathname.startsWith("/api/public/")) {
				event.respondWith(staleWhileRevalidate(request, API_CACHE));
			}
			// else: passthrough (no respondWith) — network only, never cached.
			return;
		}
		// Sentry tunnel + any monitoring endpoint — never cache.
		if (url.pathname.startsWith("/monitoring")) return;

		if (isStaticAsset(url)) {
			event.respondWith(cacheFirst(request, STATIC_CACHE));
		}
		return;
	}

	// Cross-origin: only bounded caching of public Cloudinary imagery. Everything
	// else (Clerk, Supabase, Sentry, PostHog, Mapbox) passes through untouched.
	if (url.hostname === "res.cloudinary.com") {
		event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT));
	}
});
