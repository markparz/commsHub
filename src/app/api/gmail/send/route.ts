import { NextRequest, NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { to, cc, subject, body, threadId, inReplyTo } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (isDemoMode()) {
      return NextResponse.json({
        ok: true,
        demo: true,
        reply: Boolean(threadId || inReplyTo),
        forwarded: Boolean(subject && /^fwd:/i.test(String(subject))),
      });
    }
    await sendGmailMessage(to, subject, body, {
      threadId,
      inReplyTo,
      cc: cc || undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
