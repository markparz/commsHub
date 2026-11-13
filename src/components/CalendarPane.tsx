"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { addHours, format, isToday, parseISO } from "date-fns";
import type { CalendarEvent } from "@/lib/types";
import { usePersistedNumber } from "@/hooks/usePersistedNumber";
import { ResizeHandle } from "./ResizeHandle";

const MIN_PREVIEW = 18;
const MAX_PREVIEW = 70;

type Props = {
  connected: boolean;
  onEvents: (events: CalendarEvent[]) => void;
};

function toLocalInputValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function eventTitle(ev: CalendarEvent) {
  return ev.isInvitation ? `(Invitation) ${ev.title}` : ev.title;
}

function formatTimeSlot(startIso: string, endIso: string) {
  const startAt = parseISO(startIso);
  const endAt = parseISO(endIso || startIso);
  return `${format(startAt, "h:mma")}-${format(endAt, "h:mma")}`;
}

function attendeeLabel(person: {
  email: string;
  displayName?: string;
  responseStatus?: string;
}) {
  const name = person.displayName?.trim() || person.email;
  return person.responseStatus === "accepted" ? `(yes) ${name}` : name;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Group overlapping meetings into conflict clusters.
 * Each cluster (same overlapping time window) gets a distinct color index.
 * Separate conflicts at different times get different colors.
 */
function conflictGroupByEventId(events: CalendarEvent[]): Map<string, number> {
  const ranges = events.map((ev) => {
    const start = new Date(ev.start).getTime();
    const end = new Date(ev.end || ev.start).getTime();
    return {
      id: ev.id,
      start: Number.isNaN(start) ? 0 : start,
      end: Number.isNaN(end) ? start : Math.max(end, start),
    };
  });

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) || id;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const r of ranges) parent.set(r.id, r.id);

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (
        rangesOverlap(
          ranges[i].start,
          ranges[i].end,
          ranges[j].start,
          ranges[j].end,
        )
      ) {
        union(ranges[i].id, ranges[j].id);
      }
    }
  }

  // Only keep groups with 2+ events (actual conflicts)
  const members = new Map<string, string[]>();
  for (const r of ranges) {
    const root = find(r.id);
    const list = members.get(root) || [];
    list.push(r.id);
    members.set(root, list);
  }

  const conflictRoots = [...members.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => {
      const earliest = Math.min(
        ...ids.map((id) => ranges.find((r) => r.id === id)!.start),
      );
      return { root, earliest };
    })
    .sort((a, b) => a.earliest - b.earliest);

  const colorById = new Map<string, number>();
  conflictRoots.forEach((group, index) => {
    for (const id of members.get(group.root) || []) {
      colorById.set(id, index % 6);
    }
  });
  return colorById;
}

export function CalendarPane({ connected, onEvents }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => toLocalInputValue(new Date()));
  const [end, setEnd] = useState(() =>
    toLocalInputValue(addHours(new Date(), 1)),
  );
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState("");
  const [acting, setActing] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [previewPct, setPreviewPct] = usePersistedNumber(
    "comms-hub-cal-preview",
    38,
  );

  const load = useCallback(() => {
    return fetch("/api/calendar/events")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: CalendarEvent[] = data.events || [];
        setEvents(list);
        onEvents(list);
        setSelected((prev) =>
          prev ? list.find((ev) => ev.id === prev.id) || null : null,
        );
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [onEvents]);

  useEffect(() => {
    if (!connected) return;
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [connected, load]);

  const conflictGroups = useMemo(
    () => conflictGroupByEventId(events),
    [events],
  );

  const dragPreview = useCallback(
    (deltaPx: number) => {
      const height = layoutRef.current?.clientHeight || 1;
      const deltaPct = (deltaPx / height) * 100;
      // Dragging down grows the list / shrinks preview
      setPreviewPct((prev) =>
        Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, prev - deltaPct)),
      );
    },
    [setPreviewPct],
  );

  const openCreate = () => {
    const now = new Date();
    setTitle("");
    setStart(toLocalInputValue(now));
    setEnd(toLocalInputValue(addHours(now, 1)));
    setLocation("");
    setAttendees("");
    setCreating(true);
    setSelected(null);
    setError(null);
    setStatus(null);
  };

  const respondToInvitation = async (
    id: string,
    action: "accept" | "delete",
  ) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/calendar/events/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${action} failed`);
        return;
      }
      if (action === "delete") {
        setSelected(null);
        setStatus(
          data.demo ? "Invitation deleted (demo)" : "Invitation deleted",
        );
      } else {
        setStatus(
          data.demo ? "Invitation accepted (demo)" : "Invitation accepted",
        );
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  const createEvent = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          location: location || undefined,
          attendees,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create event");
        return;
      }
      setCreating(false);
      setStatus(data.demo ? "Event added (demo)" : "Event added");
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!connected) {
    return (
      <div className="pane-empty">
        <p>Connect Google to see upcoming meetings and get 1-minute alerts.</p>
        <a className="btn-primary" href="/api/auth/google">
          Connect Google
        </a>
      </div>
    );
  }

  return (
    <div
      className="pane-body calendar-body"
      ref={layoutRef}
      style={
        {
          "--cal-preview": `${previewPct}%`,
        } as CSSProperties
      }
    >
      <div className="calendar-main">
        <div className="pane-toolbar">
          <button type="button" className="btn-ghost" onClick={openCreate}>
            New event
          </button>
          <button type="button" className="btn-ghost" onClick={() => load()}>
            Refresh
          </button>
        </div>
        {error && <p className="error-line">{error}</p>}
        {status && <p className="muted cal-status">{status}</p>}

        {creating && (
          <form className="event-form" onSubmit={createEvent}>
            <p className="compose-label">New event</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              required
              autoFocus
            />
            <label className="field-label">
              Start
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label className="field-label">
              End
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
            />
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Attendees (comma-separated emails)"
            />
            <div className="compose-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Add event"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <ul className="event-list">
          {events.map((ev) => {
            const startAt = parseISO(ev.start);
            const dayLabel = isToday(startAt)
              ? "Today"
              : format(startAt, "EEE");
            const dateLabel = format(startAt, "MMM d");
            const active = selected?.id === ev.id;
            const conflictColor = conflictGroups.get(ev.id);
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  className={[
                    "event-card",
                    ev.isInvitation ? "event-invite" : "",
                    conflictColor != null
                      ? `event-conflict event-conflict-${conflictColor}`
                      : "",
                    active ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    setSelected(ev);
                    setCreating(false);
                  }}
                >
                  <div className="event-time">
                    <span className="event-day">
                      {dayLabel} · {dateLabel}
                    </span>
                    <span className="event-clock">
                      {formatTimeSlot(ev.start, ev.end)}
                    </span>
                  </div>
                  <div className="event-main">
                    <h3>{eventTitle(ev)}</h3>
                    {(ev.location || ev.meetLink) && (
                      <p className="muted">
                        {ev.location || "Video call"}
                        {ev.meetLink ? " · Join available" : ""}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {events.length === 0 && !error && !creating && (
          <p className="muted cal-empty">No upcoming events in the next week.</p>
        )}
      </div>

      <ResizeHandle
        orientation="horizontal"
        label="Resize calendar preview"
        onDrag={dragPreview}
      />

      <div className="event-preview">
        {selected ? (
          <article>
            <div className="event-preview-head">
              <p className="compose-label">
                {selected.isInvitation ? "Invitation" : "Event"}
              </p>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <h3>{eventTitle(selected)}</h3>
            <p className="event-preview-when">
              {format(parseISO(selected.start), "EEE, MMM d")}
              {" · "}
              {formatTimeSlot(selected.start, selected.end)}
            </p>
            {(selected.location || selected.meetLink) && (
              <p className="muted">
                {selected.location || "Video call"}
                {selected.meetLink && (
                  <>
                    {" · "}
                    <a
                      href={selected.meetLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join
                    </a>
                  </>
                )}
              </p>
            )}
            <div className="event-preview-section">
              <p className="field-label">Invitees</p>
              {selected.attendees && selected.attendees.length > 0 ? (
                <ul className="invitee-list">
                  {selected.attendees.map((person) => (
                    <li
                      key={person.email}
                      className={
                        person.responseStatus === "accepted"
                          ? "invitee accepted"
                          : "invitee"
                      }
                    >
                      {attendeeLabel(person)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No invitees listed</p>
              )}
            </div>
            <div className="event-preview-section">
              <p className="field-label">Description</p>
              <p className="event-description">
                {selected.description?.trim() || "No description"}
              </p>
            </div>
            {selected.isInvitation && (
              <div className="compose-actions mail-actions event-invite-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={acting}
                  onClick={() => respondToInvitation(selected.id, "accept")}
                >
                  {acting ? "Working…" : "Accept"}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={acting}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this invitation from your calendar?",
                      )
                    ) {
                      void respondToInvitation(selected.id, "delete");
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ) : (
          <p className="muted">Select an event to preview details</p>
        )}
      </div>
    </div>
  );
}
