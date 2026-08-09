import type { NodeOptions } from "@sentry/nextjs";

export type SentryErrorEvent = Parameters<
	NonNullable<NodeOptions["beforeSend"]>
>[0];
export type SentrySpan = Parameters<
	NonNullable<NodeOptions["beforeSendSpan"]>
>[0];
export type SentryTransactionEvent = Parameters<
	NonNullable<NodeOptions["beforeSendTransaction"]>
>[0];
export type SentryTraceSamplingContext = Parameters<
	NonNullable<NodeOptions["tracesSampler"]>
>[0];

const UNSUBSCRIBE_PATH = "/api/notifications/unsubscribe";
const UNSUBSCRIBE_URL_WITH_QUERY =
	/(https?:\/\/[^\s"'<>]*\/api\/notifications\/unsubscribe[^\s"'<>?]*|\/api\/notifications\/unsubscribe[^\s"'<>?]*)\?[^\s"'<>]*/gi;

function containsUnsubscribePath(value: unknown): value is string {
	return typeof value === "string" && value.includes(UNSUBSCRIBE_PATH);
}

function redactUrlText(value: string): string {
	if (!containsUnsubscribePath(value)) return value;
	return value.replace(UNSUBSCRIBE_URL_WITH_QUERY, "$1");
}

function scrubStringRecord(
	values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!values) return values;
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [
			key,
			typeof value === "string" ? redactUrlText(value) : value,
		]),
	);
}

function scrubRequest<
	T extends SentryErrorEvent | SentryTransactionEvent,
>(event: T): T {
	const request = event.request;
	if (!request) return event;

	const requestUrl = request.url;
	const sensitive = containsUnsubscribePath(requestUrl);
	if (requestUrl) request.url = redactUrlText(requestUrl);
	if (sensitive) request.query_string = undefined;
	if (request.headers) {
		request.headers = Object.fromEntries(
			Object.entries(request.headers).map(([key, value]) => [
				key,
				typeof value === "string" ? redactUrlText(value) : value,
			]),
		);
	}

	return event;
}

function scrubBreadcrumbs<
	T extends SentryErrorEvent | SentryTransactionEvent,
>(event: T): T {
	if (!event.breadcrumbs) return event;
	event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
		...breadcrumb,
		data: scrubStringRecord(breadcrumb.data),
		message: breadcrumb.message
			? redactUrlText(breadcrumb.message)
			: breadcrumb.message,
	}));
	return event;
}

/** Remove the signed unsubscribe token from error and message events. */
export function scrubSentryEvent(event: SentryErrorEvent): SentryErrorEvent {
	return scrubBreadcrumbs(scrubRequest(event));
}

function scrubSpanData<T extends Record<string, unknown>>(
	data: T,
	context?: string,
): T {
	const sensitive =
		containsUnsubscribePath(context) ||
		Object.values(data).some(containsUnsubscribePath);
	const scrubbed = { ...data };
	for (const [key, value] of Object.entries(scrubbed)) {
		if (sensitive && key === "url.query") {
			Reflect.deleteProperty(scrubbed, key);
		} else if (typeof value === "string") {
			Reflect.set(scrubbed, key, redactUrlText(value));
		}
	}
	return scrubbed;
}

/** Remove the signed unsubscribe token from a serialized trace span. */
export function scrubSentrySpan(span: SentrySpan): SentrySpan {
	return {
		...span,
		description: span.description
			? redactUrlText(span.description)
			: span.description,
		data: scrubSpanData(span.data, span.description),
	};
}

/** Remove the signed unsubscribe token from transaction request/span data. */
export function scrubSentryTransaction(
	event: SentryTransactionEvent,
): SentryTransactionEvent {
	scrubBreadcrumbs(scrubRequest(event));
	if (event.transaction) event.transaction = redactUrlText(event.transaction);
	if (event.spans) event.spans = event.spans.map(scrubSentrySpan);
	if (event.contexts?.trace?.data) {
		event.contexts.trace.data = scrubSpanData(
			event.contexts.trace.data,
			event.request?.url,
		);
	}
	return event;
}

/** Never sample a trace whose incoming URL contains the bearer token. */
export function unsubscribeSafeTraceSampler(
	context: SentryTraceSamplingContext,
): number {
	return containsUnsubscribePath(context.normalizedRequest?.url)
		? 0
		: context.inheritOrSampleWith(0.05);
}
