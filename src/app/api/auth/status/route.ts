import { NextResponse } from "next/server";
import { getSession, isDemoMode } from "@/lib/session";
import { getConfiguredSlackToken } from "@/lib/slack";

export async function GET() {
  const session = await getSession();
  const googleConnected = Boolean(session.googleAccessToken);
  const slackConnected = Boolean(
    session.slackAccessToken || getConfiguredSlackToken(),
  );
  // Demo only when no real Google session is active
  const demo = isDemoMode() && !googleConnected;
  return NextResponse.json({
    google: googleConnected || demo,
    slack: slackConnected || demo,
    demo,
  });
}
