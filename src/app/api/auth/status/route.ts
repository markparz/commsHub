import { NextResponse } from "next/server";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const googleConnected = Boolean(session.googleAccessToken);
  const slackConnected = Boolean(session.slackAccessToken);
  // Demo only when no real Google session is active
  const demo = isDemoMode() && !googleConnected;
  return NextResponse.json({
    google: googleConnected || demo,
    slack: slackConnected || demo,
    demo,
  });
}
