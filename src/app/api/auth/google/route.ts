import { NextResponse } from "next/server";
import { getGoogleOAuthClient, GOOGLE_SCOPES } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.redirect(
      new URL("/?demo=1", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    );
  }

  const client = getGoogleOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });
  return NextResponse.redirect(url);
}
