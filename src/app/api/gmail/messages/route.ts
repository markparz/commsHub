import { NextResponse } from "next/server";
import { listDemoGmail } from "@/lib/demo-gmail";
import { getGmailUserEmails, listGmailMessages } from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    const useDemo = isDemoMode() && !session.googleAccessToken;
    if (useDemo) {
      return NextResponse.json({
        messages: listDemoGmail(),
        userEmail: "you@example.com",
        userEmails: ["you@example.com"],
      });
    }
    const [messages, userEmails] = await Promise.all([
      listGmailMessages(25),
      getGmailUserEmails(),
    ]);
    return NextResponse.json({
      messages,
      userEmail: userEmails[0] || null,
      userEmails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mail";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
