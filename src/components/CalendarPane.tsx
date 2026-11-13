"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { addHours, format, isToday, parseISO } from "date-fns";
import type { CalendarEvent } from "@/lib/types";

type Props = {
  connected: boolean;
  onEvents: (events: CalendarEvent[]) => void;
};

function toLocalInputValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function CalendarPane({ connected, onEvents }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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

  const load = useCallback(() => {
    return fetch("/api/calendar/events")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: CalendarEvent[] = data.events || [];
        setEvents(list);
        onEvents(list);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [onEvents]);

  useEffect(() => {
    if (!connected) return;
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [connected, load]);

  const openCreate = () => {
    const now = new Date();
    setTitle("");
    setStart(toLocalInputValue(now));
    setEnd(toLocalInputValue(addHours(now, 1)));
    setLocation("");
    setAttendees("");
    setCreating(true);
    setError(null);
    setStatus(null);
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
    <div className="pane-body calendar-body">
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
          return (
            <li key={ev.id} className="event-card">
              <div className="event-time">
                <span className="event-day">
                  {isToday(startAt) ? "Today" : format(startAt, "EEE")}
                </span>
                <span className="event-clock">
                  {format(startAt, "h:mm a")}
                </span>
              </div>
              <div className="event-main">
                <h3>{ev.title}</h3>
                {(ev.location || ev.meetLink) && (
                  <p className="muted">
                    {ev.location || "Video call"}
                    {ev.meetLink && (
                      <>
                        {" · "}
                        <a href={ev.meetLink} target="_blank" rel="noreferrer">
                          Join
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {events.length === 0 && !error && !creating && (
        <p className="muted">No upcoming events in the next week.</p>
      )}
    </div>
  );
}
