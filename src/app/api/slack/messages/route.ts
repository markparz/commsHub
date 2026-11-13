import { NextRequest, NextResponse } from "next/server";
import { demoSlackMessages } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/session";
import { listSlackMessages } from "@/lib/slack";

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channel");
  if (!channelId) {
    return NextResponse.json({ error: "channel required" }, { status: 400 });
  }

  try {
    if (isDemoMode()) {
      return NextResponse.json({
        messages: demoSlackMessages[channelId] || [],
      });
    }
    const messages = await listSlackMessages(channelId);
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load messages";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
