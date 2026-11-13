import { NextRequest, NextResponse } from "next/server";
import { isDemoMode } from "@/lib/session";
import { sendSlackMessage } from "@/lib/slack";

export async function POST(req: NextRequest) {
  try {
    const { channelId, text } = await req.json();
    if (!channelId || !text) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (isDemoMode()) {
      return NextResponse.json({ ok: true, demo: true });
    }
    await sendSlackMessage(channelId, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
