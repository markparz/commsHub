import type { CalendarEvent } from "./types";
import { buildDemoCalendar } from "./demo-data";

/** Extra events created in demo mode during this server process. */
const created: CalendarEvent[] = [];

export function listDemoCalendarEvents(): CalendarEvent[] {
  const base = buildDemoCalendar();
  return [...created, ...base].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}

export function addDemoCalendarEvent(
  input: Omit<CalendarEvent, "id"> & { id?: string },
): CalendarEvent {
  const event: CalendarEvent = {
    id: input.id || `demo-${Date.now()}`,
    title: input.title,
    start: input.start,
    end: input.end,
    location: input.location,
    meetLink: input.meetLink,
    attendees: input.attendees,
  };
  created.unshift(event);
  return event;
}
