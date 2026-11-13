import { NextRequest, NextResponse } from "next/server";
import {
  addDemoCalendarEvent,
  listDemoCalendarEvents,
} from "@/lib/demo-calendar";
import {
  createCalendarEvent,
  filterUpcomingEvents,
  listCalendarEvents,
} from "@/lib/google";
import { getSession, isDemoMode } from "@/lib/session";

async function shouldUseDemo() {
  const session = await getSession();
  if (session.googleAccessToken) return false;
  return isDemoMode();
}

export async function GET() {
  try {
    if (await shouldUseDemo()) {
      return NextResponse.json({
        events: filterUpcomingEvents(listDemoCalendarEvents()),
      });
    }
    const events = filterUpcomingEvents(await listCalendarEvents());
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
      ? body.attendees
          .map((entry) =>
            typeof entry === "string"
              ? { email: entry }
              : {
                  email: String(entry.email || ""),
                  displayName: entry.displayName
                    ? String(entry.displayName)
                    : undefined,
                  responseStatus: entry.responseStatus,
                },
          )
          .filter((a) => a.email)
      : typeof body.attendees === "string"
        ? body.attendees
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .map((email) => ({ email }))
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

    if (await shouldUseDemo()) {
      const event = addDemoCalendarEvent({
        title,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        location,
        description,
        attendees,
      });
      return NextResponse.json({ event, demo: true });
    }

    const session = await getSession();
    if (!session.googleAccessToken) {
      return NextResponse.json(
        { error: "Connect Google to create events" },
        { status: 401 },
      );
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
