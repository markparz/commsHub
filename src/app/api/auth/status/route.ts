import { NextResponse } from "next/server";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    google: Boolean(session.googleAccessToken) || isDemoMode(),
    slack: Boolean(session.slackAccessToken) || isDemoMode(),
    demo: isDemoMode(),
  });
}
