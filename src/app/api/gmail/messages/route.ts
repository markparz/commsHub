import { NextResponse } from "next/server";
import { listDemoGmail } from "@/lib/demo-gmail";
import {
  getGmailInboxCounts,
  getGmailUserEmails,
  listGmailMessages,
} from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    const useDemo = isDemoMode() && !session.googleAccessToken;
    if (useDemo) {
      const messages = listDemoGmail();
      return NextResponse.json({
        messages,
        userEmail: "you@example.com",
        userEmails: ["you@example.com"],
        inbox: {
          unread: messages.filter((m) => m.unread).length,
          total: messages.length,
        },
      });
    }
    const [messages, userEmails, inbox] = await Promise.all([
      listGmailMessages(25),
      getGmailUserEmails(),
      getGmailInboxCounts(),
    ]);
    return NextResponse.json({
      messages,
      userEmail: userEmails[0] || null,
      userEmails,
      inbox,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mail";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
