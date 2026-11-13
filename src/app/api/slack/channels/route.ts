import { NextResponse } from "next/server";
import { demoChannels } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/session";
import { listSlackChannels } from "@/lib/slack";

export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ channels: demoChannels });
    }
    const channels = await listSlackChannels();
    return NextResponse.json({ channels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load channels";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
