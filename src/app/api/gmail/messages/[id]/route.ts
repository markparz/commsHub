import { NextRequest, NextResponse } from "next/server";
import {
  acceptDemoGmailInvitation,
  archiveDemoGmail,
  declineDemoGmailInvitation,
  deleteDemoGmail,
  getDemoGmailDetail,
} from "@/lib/demo-gmail";
import {
  acceptGmailInvitation,
  archiveGmailMessage,
  declineGmailInvitation,
  deleteGmailMessage,
  getGmailMessageDetail,
} from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession();
    const useDemo = isDemoMode() && !session.googleAccessToken;

    if (useDemo) {
      const message = getDemoGmailDetail(id);
      if (!message) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ message, demo: true });
    }

    const message = await getGmailMessageDetail(id);
    return NextResponse.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, threadId } = body as {
      action?: string;
      threadId?: string;
    };

    if (
      action !== "archive" &&
      action !== "delete" &&
      action !== "accept-invite" &&
      action !== "decline-invite"
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const session = await getSession();
    const useDemo = isDemoMode() && !session.googleAccessToken;

    if (useDemo) {
      if (action === "accept-invite" || action === "decline-invite") {
        const result =
          action === "accept-invite"
            ? acceptDemoGmailInvitation(id, threadId)
            : declineDemoGmailInvitation(id, threadId);
        if (!result.ok) {
          return NextResponse.json(
            { error: "Invitation not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({
          ok: true,
          demo: true,
          action,
          eventId: result.eventId,
        });
      }
      const ok =
        action === "archive"
          ? archiveDemoGmail(id, threadId)
          : deleteDemoGmail(id, threadId);
      if (!ok) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action });
    }

    if (action === "accept-invite") {
      const result = await acceptGmailInvitation(id, threadId);
      return NextResponse.json({ ok: true, action, eventId: result.eventId });
    }
    if (action === "decline-invite") {
      const result = await declineGmailInvitation(id, threadId);
      return NextResponse.json({ ok: true, action, eventId: result.eventId });
    }
    if (action === "archive") {
      await archiveGmailMessage(id, threadId);
    } else {
      await deleteGmailMessage(id, threadId);
    }
    return NextResponse.json({ ok: true, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const threadId = req.nextUrl.searchParams.get("threadId") || undefined;
    if (isDemoMode()) {
      const ok = deleteDemoGmail(id, threadId);
      if (!ok) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action: "delete" });
    }
    await deleteGmailMessage(id, threadId);
    return NextResponse.json({ ok: true, action: "delete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
