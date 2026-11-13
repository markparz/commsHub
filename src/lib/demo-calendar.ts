import type { CalendarEvent } from "./types";
import { buildDemoCalendar } from "./demo-data";

/** Extra events created in demo mode during this server process. */
const created: CalendarEvent[] = [];
const removedIds = new Set<string>();
const acceptedIds = new Set<string>();

export function listDemoCalendarEvents(): CalendarEvent[] {
  const base = buildDemoCalendar().map((ev) =>
    acceptedIds.has(ev.id) ? markSelfAccepted(ev) : ev,
  );
  const extras = created.map((ev) =>
    acceptedIds.has(ev.id) ? markSelfAccepted(ev) : { ...ev },
  );
  return [...extras, ...base]
    .filter((ev) => !removedIds.has(ev.id))
    .sort(
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
    description: input.description,
    isInvitation: input.isInvitation,
  };
  created.unshift(event);
  return event;
}

function markSelfAccepted(ev: CalendarEvent): CalendarEvent {
  return {
    ...ev,
    isInvitation: false,
    attendees: ev.attendees?.map((a) =>
      a.self ? { ...a, responseStatus: "accepted" as const } : a,
    ),
  };
}

export function acceptDemoCalendarInvitation(id: string): boolean {
  const list = [...created, ...buildDemoCalendar()];
  if (!list.some((ev) => ev.id === id)) return false;
  acceptedIds.add(id);
  const createdIdx = created.findIndex((ev) => ev.id === id);
  if (createdIdx >= 0) {
    created[createdIdx] = markSelfAccepted(created[createdIdx]);
  }
  return true;
}

export function deleteDemoCalendarEvent(id: string): boolean {
  const list = [...created, ...buildDemoCalendar()];
  if (!list.some((ev) => ev.id === id)) return false;
  removedIds.add(id);
  const createdIdx = created.findIndex((ev) => ev.id === id);
  if (createdIdx >= 0) created.splice(createdIdx, 1);
  return true;
}
