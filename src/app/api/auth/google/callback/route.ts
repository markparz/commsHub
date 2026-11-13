import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthClient } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(new URL("/?error=google_denied", base));
  }

  const client = getGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  const session = await getSession();
  session.googleAccessToken = tokens.access_token || undefined;
  session.googleRefreshToken = tokens.refresh_token || session.googleRefreshToken;
  session.googleExpiry = tokens.expiry_date || undefined;
  await session.save();

  return NextResponse.redirect(new URL("/?connected=google", base));
}
