import { NextRequest, NextResponse } from "next/server";
import { archiveDemoGmail, deleteDemoGmail } from "@/lib/demo-gmail";
import { archiveGmailMessage, deleteGmailMessage } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { action } = await req.json();

    if (action !== "archive" && action !== "delete") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (isDemoMode()) {
      const ok =
        action === "archive" ? archiveDemoGmail(id) : deleteDemoGmail(id);
      if (!ok) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action });
    }

    if (action === "archive") {
      await archiveGmailMessage(id);
    } else {
      await deleteGmailMessage(id);
    }
    return NextResponse.json({ ok: true, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (isDemoMode()) {
      const ok = deleteDemoGmail(id);
      if (!ok) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action: "delete" });
    }
    await deleteGmailMessage(id);
    return NextResponse.json({ ok: true, action: "delete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
