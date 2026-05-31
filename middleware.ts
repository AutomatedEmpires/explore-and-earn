import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(_request: NextRequest) {
  void _request;

  // TODO: Refresh Supabase session and attach request scope metadata once
  // production auth/session handling is approved for implementation.
  return NextResponse.next();
}