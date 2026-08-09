import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	scrubSentryEvent,
	scrubSentrySpan,
	scrubSentryTransaction,
	type SentryErrorEvent,
	type SentrySpan,
	type SentryTransactionEvent,
	unsubscribeSafeTraceSampler,
} from "../../lib/sentryPrivacy";

const TOKEN = "signed.secret.token";
const SENSITIVE_URL =
	`https://exploreandearn.com/api/notifications/unsubscribe?token=${TOKEN}`;

function span(data: SentrySpan["data"]): SentrySpan {
	return {
		data,
		description: `POST ${SENSITIVE_URL}`,
		span_id: "span-id",
		start_timestamp: 1,
		trace_id: "trace-id",
	};
}

describe("Sentry unsubscribe-token privacy", () => {
	it("redacts request URLs, query strings, referrers, and breadcrumbs", () => {
		const event: SentryErrorEvent = {
			breadcrumbs: [{ data: { url: SENSITIVE_URL } }],
			request: {
				headers: { referer: SENSITIVE_URL },
				query_string: `token=${TOKEN}`,
				url: SENSITIVE_URL,
			},
		};

		const scrubbed = scrubSentryEvent(event);
		expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
		expect(scrubbed.request?.url).toBe(
			"https://exploreandearn.com/api/notifications/unsubscribe",
		);
		expect(scrubbed.request?.query_string).toBeUndefined();
	});

	it("redacts both legacy transaction spans and current span attributes", () => {
		const child = span({
			"http.request.header.referer": SENSITIVE_URL,
			"url.full": SENSITIVE_URL,
			"url.query": `token=${TOKEN}`,
		});
		const transaction: SentryTransactionEvent = {
			request: { query_string: `token=${TOKEN}`, url: SENSITIVE_URL },
			spans: [child],
		};

		const scrubbedTransaction = scrubSentryTransaction(transaction);
		const scrubbedSpan = scrubSentrySpan(child);
		expect(JSON.stringify(scrubbedTransaction)).not.toContain(TOKEN);
		expect(JSON.stringify(scrubbedSpan)).not.toContain(TOKEN);
		expect(scrubbedSpan.data).not.toHaveProperty("url.query");
	});

	it("drops only unsubscribe traces and preserves the existing sample rate", () => {
		const base = {
			attributes: {},
			inheritOrSampleWith: () => 0.05,
			name: "request",
		};
		expect(
			unsubscribeSafeTraceSampler({
				...base,
				normalizedRequest: { url: SENSITIVE_URL },
			}),
		).toBe(0);
		expect(
			unsubscribeSafeTraceSampler({
				...base,
				normalizedRequest: { url: "https://exploreandearn.com/jobs" },
			}),
		).toBe(0.05);
	});

	it("wires every scrubber into both server and edge Sentry initialization", () => {
		const instrumentation = readFileSync(
			fileURLToPath(new URL("../../instrumentation.ts", import.meta.url)),
			"utf8",
		);
		expect(instrumentation.match(/beforeSend: scrubSentryEvent/g)).toHaveLength(2);
		expect(instrumentation.match(/beforeSendSpan: scrubSentrySpan/g)).toHaveLength(2);
		expect(
			instrumentation.match(/beforeSendTransaction: scrubSentryTransaction/g),
		).toHaveLength(2);
		expect(
			instrumentation.match(/tracesSampler: unsubscribeSafeTraceSampler/g),
		).toHaveLength(2);
	});
});
