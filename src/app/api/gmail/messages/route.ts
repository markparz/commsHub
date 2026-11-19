import { NextResponse } from "next/server";
import { listDemoGmail } from "@/lib/demo-gmail";
import { getGmailUserEmail, listGmailMessages } from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    const useDemo = isDemoMode() && !session.googleAccessToken;
    if (useDemo) {
      return NextResponse.json({
        messages: listDemoGmail(),
        userEmail: "you@example.com",
      });
    }
    const [messages, userEmail] = await Promise.all([
      listGmailMessages(25),
      getGmailUserEmail(),
    ]);
    return NextResponse.json({ messages, userEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mail";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
