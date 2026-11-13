import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=slack_denied", base));
  }

  const body = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    client_secret: process.env.SLACK_CLIENT_SECRET || "",
    code,
    redirect_uri:
      process.env.SLACK_REDIRECT_URI ||
      `${base}/api/auth/slack/callback`,
  });

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await tokenRes.json();

  if (!data.ok) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(data.error || "slack_oauth")}`, base),
    );
  }

  const session = await getSession();
  session.slackAccessToken = data.access_token;
  session.slackTeamName = data.team?.name;
  session.slackUserId = data.authed_user?.id;
  await session.save();

  return NextResponse.redirect(new URL("/?connected=slack", base));
}
