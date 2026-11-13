import { NextRequest, NextResponse } from "next/server";
import {
  addDemoCalendarEvent,
  listDemoCalendarEvents,
} from "@/lib/demo-calendar";
import { createCalendarEvent, listCalendarEvents } from "@/lib/google";
import { isDemoMode } from "@/lib/session";

export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ events: listDemoCalendarEvents() });
    }
    const events = await listCalendarEvents();
    return NextResponse.json({ events });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load calendar";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    const start = String(body.start || "").trim();
    const end = String(body.end || "").trim();
    const location = body.location ? String(body.location).trim() : undefined;
    const description = body.description
      ? String(body.description).trim()
      : undefined;
    const attendees = Array.isArray(body.attendees)
      ? body.attendees.map(String).filter(Boolean)
      : typeof body.attendees === "string"
        ? body.attendees
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : undefined;

    if (!title || !start || !end) {
      return NextResponse.json(
        { error: "Title, start, and end are required" },
        { status: 400 },
      );
    }
    if (new Date(end) <= new Date(start)) {
      return NextResponse.json(
        { error: "End must be after start" },
        { status: 400 },
      );
    }

    if (isDemoMode()) {
      const event = addDemoCalendarEvent({
        title,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        location,
        attendees,
      });
      return NextResponse.json({ event, demo: true });
    }

    const event = await createCalendarEvent({
      title,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      location,
      description,
      attendees,
    });
    return NextResponse.json({ event });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
