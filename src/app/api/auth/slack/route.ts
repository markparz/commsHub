import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSlackAuthorizeUrl } from "@/lib/slack";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (isDemoMode()) {
    return NextResponse.redirect(new URL("/?demo=1", base));
  }

  const state = randomBytes(16).toString("hex");
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  return NextResponse.redirect(getSlackAuthorizeUrl(state));
}
