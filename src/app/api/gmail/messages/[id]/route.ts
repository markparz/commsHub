import { NextRequest, NextResponse } from "next/server";
import { archiveDemoGmail, deleteDemoGmail } from "@/lib/demo-gmail";
import { archiveGmailMessage, deleteGmailMessage } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, threadId } = body as {
      action?: string;
      threadId?: string;
    };

    if (action !== "archive" && action !== "delete") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (isDemoMode()) {
      const ok =
        action === "archive"
          ? archiveDemoGmail(id, threadId)
          : deleteDemoGmail(id, threadId);
      if (!ok) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action });
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
