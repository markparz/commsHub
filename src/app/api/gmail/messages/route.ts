import { NextResponse } from "next/server";
import { listDemoGmail } from "@/lib/demo-gmail";
import { listGmailMessages } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ messages: listDemoGmail() });
    }
    const messages = await listGmailMessages();
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mail";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
