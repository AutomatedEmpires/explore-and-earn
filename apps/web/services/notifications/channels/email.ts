import "server-only"

import type { NotificationIntent } from "@explore-and-earn/contracts"
import { isEmailSuppressed } from "@explore-and-earn/db"

import { absoluteUrl, sendEmail } from "../../../lib/email"
import { renderEmailLayout, escapeHtml } from "../../../lib/emails/layout"
import { getClerkContact } from "../../../lib/clerkUser"
import { classifyHttpFailure, isRetryable } from "../backoff"
import { localizedPath, renderMessage, renderNotification } from "../render"
import { createUnsubscribeToken } from "../unsubscribe"
import { buildListUnsubscribeHeaders } from "../unsubscribeHeaders"
import type { ChannelSendResult } from "./inApp"

/**
 * Email channel: recipient address comes from Clerk (profiles hold no email),
 * the body is rendered in the recipient's locale, suppression is checked
 * BEFORE provider submission, and every engine email carries a REAL scoped
 * one-click unsubscribe (footer link + RFC 8058 List-Unsubscribe headers).
 */
export async function sendNotificationEmail(
	intent: NotificationIntent,
	engineDedupKey: string,
	nowMs: number,
): Promise<ChannelSendResult & { readonly suppressed?: string }> {
	const contact = await getClerkContact(intent.recipientClerkUserId)
	if (!contact.email) {
		// getClerkContact folds transient Clerk failures into a null email, so
		// this is retried (bounded) rather than terminally misclassified; a
		// genuinely email-less account dead-letters after the attempt budget.
		return {
			ok: false,
			retryable: true,
			failureClass: "transient",
			detail: "no recipient email resolved (missing address or Clerk lookup failure)",
		}
	}
	if (await isEmailSuppressed(contact.email)) {
		return { ok: false, suppressed: "email_suppressed" }
	}

	const rendered = await renderNotification(intent)
	const locale = rendered.locale
	const destination = absoluteUrl(localizedPath(locale, intent.destinationPath))

	const token = createUnsubscribeToken({
		clerkUserId: intent.recipientClerkUserId,
		scope: intent.category,
		nowMs,
	})
	const unsubscribeUrl = token
		? absoluteUrl(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`)
		: null
	const unsubscribeHeaders = buildListUnsubscribeHeaders(unsubscribeUrl)

	const [ctaLabel, footerNote, unsubscribeLabel] = await Promise.all([
		renderMessage(locale, `Notifications.email.cta.${intent.type}`, {},
			await renderMessage(locale, "Notifications.email.cta.default", {}, "View details")),
		renderMessage(locale, "Notifications.email.footerNote", {}),
		renderMessage(locale, "Notifications.email.unsubscribe", {}),
	])

	const footerHtml = unsubscribeUrl
		? `${escapeHtml(footerNote)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:inherit;">${escapeHtml(unsubscribeLabel)}</a>`
		: escapeHtml(footerNote)

	const html = renderEmailLayout({
		heading: rendered.title,
		bodyHtml: `<p style="margin:0;">${escapeHtml(rendered.body)}</p>`,
		ctaLabel,
		ctaUrl: destination,
		footerHtml,
		lang: locale,
	})
	const text = `${rendered.title}\n\n${rendered.body}\n\n${destination}${
		unsubscribeUrl ? `\n\n${unsubscribeLabel}: ${unsubscribeUrl}` : ""
	}`

	const result = await sendEmail({
		to: contact.email,
		subject: rendered.title,
		html,
		text,
		template: `engine:${intent.type}`,
		// The engine's dedup_key IS the logical send identity.
		idempotencyKey: engineDedupKey,
		...(unsubscribeHeaders ? { headers: unsubscribeHeaders } : {}),
	})

	if (result.ok) {
		return { ok: true, providerMessageId: result.providerMessageId }
	}
	const failureClass = classifyHttpFailure(result.status)
	return {
		ok: false,
		retryable: isRetryable(failureClass),
		failureClass,
		detail: result.error ?? "email send failed",
	}
}
