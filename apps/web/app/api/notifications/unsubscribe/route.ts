import { NextResponse } from "next/server";

import { readCappedBodyText } from "../../../../lib/bodyLimit";
import { reportError } from "../../../../lib/sentry";
import { renderMessage } from "../../../../services/notifications/render";
import {
	type UnsubscribePayload,
	verifyUnsubscribeToken,
} from "../../../../services/notifications/unsubscribe";
import { applyUnsubscribe } from "../../../../services/notifications/unsubscribeApply";

export const dynamic = "force-dynamic";

const MAX_ONE_CLICK_BODY_BYTES = 1024;
const ONE_CLICK_FIELD = "List-Unsubscribe";
const ONE_CLICK_VALUE = "One-Click";
const UNSUBSCRIBE_CSP = [
	"default-src 'none'",
	"style-src 'unsafe-inline'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"base-uri 'none'",
].join("; ");

/**
 * These responses carry a signed bearer token in their URL. Keep them out of
 * shared caches and prevent the page from loading or reporting to any third
 * party that could receive that URL as referrer/report metadata.
 *
 * The route-level report-only header deliberately overrides the app-wide
 * report-only policy, whose report-uri would otherwise receive this URL.
 */
const BOUNDARY_HEADERS = {
	"Cache-Control": "private, no-store, max-age=0",
	"Content-Security-Policy": UNSUBSCRIBE_CSP,
	"Content-Security-Policy-Report-Only": UNSUBSCRIBE_CSP,
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
} as const;

/**
 * RFC 8058 one-click unsubscribe — works WITHOUT login: the signed, scoped,
 * expiring token in the link is the credential (HMAC-verified, no raw user ids
 * or emails in the URL).
 *
 * GET is intentionally read-only. Link scanners and mail-client previews may
 * fetch it, so it only verifies the token and renders a no-JS confirmation.
 * POST is the sole mutation path and accepts only the RFC one-click form pair.
 */

function verifiedPayload(request: Request): UnsubscribePayload | null {
	const tokens = new URL(request.url).searchParams.getAll("token");
	if (tokens.length !== 1) return null;
	return verifyUnsubscribeToken(tokens[0] ?? "", Date.now());
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function htmlPage(args: {
	readonly title: string;
	readonly body: string;
	readonly lang: string;
	readonly actionLabel?: string;
}): NextResponse {
	const title = escapeHtml(args.title);
	const body = escapeHtml(args.body);
	const lang = escapeHtml(args.lang);
	const form = args.actionLabel
		? `<form method="post" aria-describedby="unsubscribe-description" style="margin-top:24px"><input type="hidden" name="${ONE_CLICK_FIELD}" value="${ONE_CLICK_VALUE}" /><button type="submit" style="box-sizing:border-box;min-height:48px;width:100%;border:0;border-radius:999px;padding:12px 20px;background:var(--text-primary,#24221E);color:var(--color-surface-raised,white);font:inherit;font-weight:700;cursor:pointer">${escapeHtml(args.actionLabel)}</button></form>`
		: "";

	return new NextResponse(
		`<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex,noarchive" /><title>${title}</title></head><body style="box-sizing:border-box;margin:0;padding:48px 16px;background:var(--color-canvas,#F6F3EC);color:var(--text-primary,#24221E);font-family:Inter,system-ui,sans-serif"><main style="box-sizing:border-box;width:100%;max-width:480px;margin:0 auto;background:var(--color-surface,#FFFFFF);border:1px solid var(--border-soft,#E7E1D3);border-radius:24px;padding:32px 28px"><h1 style="margin:0 0 12px;font-size:20px">${title}</h1><p id="unsubscribe-description" style="margin:0;font-size:15px;line-height:1.5">${body}</p>${form}</main></body></html>`,
		{
			status: 200,
			headers: {
				...BOUNDARY_HEADERS,
				"Content-Type": "text/html; charset=utf-8",
			},
		},
	);
}

function jsonResult(ok: boolean, status: number): NextResponse {
	return NextResponse.json(
		{ ok },
		{
			status,
			headers: BOUNDARY_HEADERS,
		},
	);
}

async function hasExactOneClickBody(request: Request): Promise<boolean> {
	const contentType = request.headers.get("content-type") ?? "";
	const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
	if (
		mediaType !== "application/x-www-form-urlencoded" &&
		mediaType !== "multipart/form-data"
	) {
		return false;
	}

	const rawBody = await readCappedBodyText(request, MAX_ONE_CLICK_BODY_BYTES);
	if (rawBody === null) return false;

	let entries: Array<[string, FormDataEntryValue]>;
	try {
		if (mediaType === "application/x-www-form-urlencoded") {
			entries = [...new URLSearchParams(rawBody).entries()];
		} else {
			const parsed = await new Response(rawBody, {
				headers: { "Content-Type": contentType },
			}).formData();
			entries = [];
			parsed.forEach((value, key) => entries.push([key, value]));
		}
	} catch {
		return false;
	}

	return (
		entries.length === 1 &&
		entries[0]?.[0] === ONE_CLICK_FIELD &&
		typeof entries[0]?.[1] === "string" &&
		entries[0][1] === ONE_CLICK_VALUE
	);
}

export async function GET(request: Request): Promise<NextResponse> {
	try {
		const payload = verifiedPayload(request);
		// Unsubscribe pages render in the default locale (the token carries no
		// locale; the page is reachable logged-out).
		if (!payload) {
			const [title, body] = await Promise.all([
				renderMessage("en", "Notifications.unsubscribePage.invalidTitle", {}),
				renderMessage("en", "Notifications.unsubscribePage.invalidBody", {}),
			]);
			return htmlPage({ title, body, lang: "en" });
		}

		const [title, body, actionLabel] = await Promise.all([
			renderMessage("en", "Notifications.unsubscribePage.confirmTitle", {}),
			renderMessage("en", "Notifications.unsubscribePage.confirmBody", {}),
			renderMessage("en", "Notifications.unsubscribePage.confirmAction", {}),
		]);
		return htmlPage({ title, body, actionLabel, lang: "en" });
	} catch (error) {
		reportError(error, { action: "notifications.unsubscribe.get" });
		return jsonResult(false, 500);
	}
}

export async function POST(request: Request): Promise<NextResponse> {
	try {
		const payload = verifiedPayload(request);
		if (!payload || !(await hasExactOneClickBody(request))) {
			return jsonResult(false, 400);
		}

		await applyUnsubscribe(payload.clerkUserId, payload.scope);
		const [title, body] = await Promise.all([
			renderMessage("en", "Notifications.unsubscribePage.successTitle", {}),
			renderMessage("en", "Notifications.unsubscribePage.successBody", {}),
		]);
		return htmlPage({ title, body, lang: "en" });
	} catch (error) {
		reportError(error, { action: "notifications.unsubscribe.post" });
		return jsonResult(false, 500);
	}
}
