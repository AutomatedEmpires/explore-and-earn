import { NextResponse } from "next/server";
import { getPublicListings } from "@explore-and-earn/db";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;

async function checkReadiness(timeoutMs = 3_000): Promise<NextResponse> {
	try {
		await getPublicListings(1, AbortSignal.timeout(timeoutMs));
		return NextResponse.json(
			{ status: "ready", checks: { database: "ok" } },
			{ status: 200, headers: RESPONSE_HEADERS },
		);
	} catch {
		return NextResponse.json(
			{ status: "not_ready", checks: { database: "unavailable" } },
			{ status: 503, headers: RESPONSE_HEADERS },
		);
	}
}

export function GET(): Promise<NextResponse> {
	return checkReadiness();
}
