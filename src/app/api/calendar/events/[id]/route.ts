import { NextRequest, NextResponse } from "next/server";
import {
  acceptDemoCalendarInvitation,
  deleteDemoCalendarEvent,
} from "@/lib/demo-calendar";
import {
  acceptCalendarInvitation,
  deleteCalendarEvent,
} from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

async function shouldUseDemo() {
  const session = await getSession();
  // Real Google session always wins over demo mode
  if (session.googleAccessToken) return false;
  return isDemoMode();
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const { action } = await req.json();

    if (action !== "accept" && action !== "delete") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (await shouldUseDemo()) {
      const ok =
        action === "accept"
          ? acceptDemoCalendarInvitation(decodedId)
          : deleteDemoCalendarEvent(decodedId);
      if (!ok) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action });
    }

    const session = await getSession();
    if (!session.googleAccessToken) {
      return NextResponse.json(
        { error: "Connect Google to manage invitations" },
        { status: 401 },
      );
    }

    if (action === "accept") {
      await acceptCalendarInvitation(decodedId);
    } else {
      await deleteCalendarEvent(decodedId);
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
    const decodedId = decodeURIComponent(id);

    if (await shouldUseDemo()) {
      const ok = deleteDemoCalendarEvent(decodedId);
      if (!ok) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, demo: true, action: "delete" });
    }

    const session = await getSession();
    if (!session.googleAccessToken) {
      return NextResponse.json(
        { error: "Connect Google to manage invitations" },
        { status: 401 },
      );
    }

    await deleteCalendarEvent(decodedId);
    return NextResponse.json({ ok: true, action: "delete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
