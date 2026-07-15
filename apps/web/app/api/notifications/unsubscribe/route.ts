import { NextResponse } from "next/server";

import { renderMessage } from "../../../../services/notifications/render";
import { verifyUnsubscribeToken } from "../../../../services/notifications/unsubscribe";
import { applyUnsubscribe } from "../../../../services/notifications/unsubscribeApply";
import { reportError } from "../../../../lib/sentry";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe — works WITHOUT login: the signed, scoped, expiring
 * token in the link is the credential (HMAC-verified, no raw user ids or
 * emails in the URL). Applying is idempotent, so repeat clicks and RFC 8058
 * one-click POSTs from mail clients are safe.
 *
 *   GET  — human clicking the email footer link: applies the unsubscribe and
 *          renders a localized confirmation page.
 *   POST — RFC 8058 List-Unsubscribe-Post one-click from the mail client.
 */

async function handleUnsubscribe(
	request: Request,
): Promise<{ ok: boolean; scope?: string }> {
	const url = new URL(request.url);
	const token = url.searchParams.get("token") ?? "";
	const payload = verifyUnsubscribeToken(token, Date.now());
	if (!payload) return { ok: false };
	await applyUnsubscribe(payload.clerkUserId, payload.scope);
	return { ok: true, scope: payload.scope };
}

function htmlPage(title: string, body: string, lang: string): NextResponse {
	const escape = (value: string) =>
		value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	return new NextResponse(
		`<!DOCTYPE html><html lang="${escape(lang)}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>${escape(title)}</title></head><body style="margin:0;padding:48px 16px;background:#F6F3EC;font-family:Inter,system-ui,sans-serif;"><div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E1D3;border-radius:24px;padding:32px 28px;"><h1 style="margin:0 0 12px;font-size:20px;color:#24221E;">${escape(title)}</h1><p style="margin:0;font-size:15px;line-height:1.5;color:#24221E;">${escape(body)}</p></div></body></html>`,
		{ status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
	);
}

export async function GET(request: Request): Promise<NextResponse> {
	try {
		const result = await handleUnsubscribe(request);
		// Unsubscribe pages render in the default locale (the token carries no
		// locale; the page is reachable logged-out).
		if (!result.ok) {
			const [title, body] = await Promise.all([
				renderMessage("en", "Notifications.unsubscribePage.invalidTitle", {}),
				renderMessage("en", "Notifications.unsubscribePage.invalidBody", {}),
			]);
			return htmlPage(title, body, "en");
		}
		const [title, body] = await Promise.all([
			renderMessage("en", "Notifications.unsubscribePage.successTitle", {}),
			renderMessage("en", "Notifications.unsubscribePage.successBody", {}),
		]);
		return htmlPage(title, body, "en");
	} catch (error) {
		reportError(error, { action: "notifications.unsubscribe.get" });
		return NextResponse.json({ ok: false }, { status: 500 });
	}
}

export async function POST(request: Request): Promise<NextResponse> {
	try {
		const result = await handleUnsubscribe(request);
		if (!result.ok) return NextResponse.json({ ok: false }, { status: 400 });
		return NextResponse.json({ ok: true });
	} catch (error) {
		reportError(error, { action: "notifications.unsubscribe.post" });
		return NextResponse.json({ ok: false }, { status: 500 });
	}
}
