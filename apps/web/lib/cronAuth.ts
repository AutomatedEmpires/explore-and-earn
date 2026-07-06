import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of a Vercel Cron request's `Authorization: Bearer
 * ${CRON_SECRET}` header. Hashing both sides first makes timingSafeEqual
 * safe for unequal lengths and keeps the comparison independent of where
 * the first differing byte falls.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
	const secret = process.env.CRON_SECRET;
	const provided = request.headers.get("authorization");
	if (!secret || !provided) return false;

	const a = createHash("sha256").update(provided).digest();
	const b = createHash("sha256").update(`Bearer ${secret}`).digest();
	return timingSafeEqual(a, b);
}
