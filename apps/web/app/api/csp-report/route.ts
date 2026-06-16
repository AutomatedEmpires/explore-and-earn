import { NextResponse } from "next/server";

import { reportMessage } from "../../../lib/sentry";

export const dynamic = "force-dynamic";

/**
 * CSP violation collector. The Content-Security-Policy-Report-Only header in
 * next.config.ts points `report-uri` here. Previously this silently 204'd, so
 * violations were invisible — meaning we could never tell whether the policy is
 * safe to promote from report-only to enforcing.
 *
 * Now each report is logged (visible in Vercel logs) and forwarded to Sentry as
 * a warning (no-ops when the DSN is unset). The endpoint still always returns
 * 204 quickly and never throws, so a malformed body can't break reporting.
 */
interface CspReportBody {
	"csp-report"?: Record<string, unknown>;
}

function summarize(report: Record<string, unknown>): string {
	const directive =
		report["violated-directive"] ?? report["effective-directive"] ?? "unknown-directive";
	const blocked = report["blocked-uri"] ?? "unknown-source";
	const doc = report["document-uri"] ?? "unknown-document";
	return `CSP violation: ${String(directive)} blocked ${String(blocked)} on ${String(doc)}`;
}

export async function POST(request: Request): Promise<NextResponse> {
	try {
		const raw = (await request.json()) as unknown;

		// Legacy `application/csp-report`: { "csp-report": {...} }.
		// Reporting API `application/reports+json`: [{ body: {...} }, ...].
		const reports: Array<Record<string, unknown>> = [];
		if (Array.isArray(raw)) {
			for (const entry of raw) {
				const body = (entry as { body?: Record<string, unknown> })?.body;
				if (body) reports.push(body);
			}
		} else if (raw && typeof raw === "object") {
			const legacy = (raw as CspReportBody)["csp-report"];
			reports.push(legacy ?? (raw as Record<string, unknown>));
		}

		for (const report of reports) {
			const summary = summarize(report);
			console.warn("[csp-report]", summary, report);
			reportMessage(summary, "warning", { route: "/api/csp-report", action: "csp_violation" });
		}
	} catch {
		// Never let a malformed report body turn into an error response.
	}

	return new NextResponse(null, { status: 204 });
}
