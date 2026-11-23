"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import {
  analyzeEmailsForTodos,
  isIgnoredTodoEmail,
  isIgnoredTodoItem,
  type EmailTodoItem,
} from "@/lib/email-todo";
import { openMailWindow } from "@/lib/mail-window";
import type { GmailMessage } from "@/lib/types";

const COMPLETED_KEY = "comms-hub-todo-completed";
const OPEN_KEY = "comms-hub-todo-open";
const LAST_SCAN_SLOT_KEY = "comms-hub-todo-last-scan-slot";

/** Local-time inbox scan slots: 8:00, 12:00, 17:30 */
const SCAN_SLOTS = [
  { hour: 8, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 17, minute: 30 },
] as const;

function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCompleted(ids: Set<string>) {
  try {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function loadOpen(): EmailTodoItem[] {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EmailTodoItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item.manual || !isIgnoredTodoItem(item));
  } catch {
    return [];
  }
}

function saveOpen(items: EmailTodoItem[]) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function slotKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Most recent scan slot that has already started today (or null). */
function currentDueScanSlot(now = new Date()): string | null {
  let latest: string | null = null;
  for (const slot of SCAN_SLOTS) {
    const at = new Date(now);
    at.setHours(slot.hour, slot.minute, 0, 0);
    if (at.getTime() <= now.getTime()) {
      latest = slotKey(at);
    }
  }
  return latest;
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function sortTodos(a: EmailTodoItem, b: EmailTodoItem) {
  const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime();
}

function formatDue(iso?: string) {
  if (!iso) return null;
  const d = parseISO(iso);
  if (!isValid(d)) return null;
  return format(d, "MMM d · h:mma");
}

export function TodoPane({
  connected,
  onOpenEmail,
  onOpenCount,
}: {
  connected: boolean;
  onOpenEmail?: (ref: { messageId: string; threadId: string }) => void;
  onOpenCount?: (count: number) => void;
}) {
  const [items, setItems] = useState<EmailTodoItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDue, setManualDue] = useState("");

  useEffect(() => {
    setCompleted(loadCompleted());
    setItems(loadOpen());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveOpen(items);
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    saveCompleted(completed);
  }, [completed, ready]);

  const scan = useCallback(async () => {
    if (!connected) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/messages");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load mail");
      const messages: GmailMessage[] = data.messages || [];
      const userEmails: string[] = Array.isArray(data.userEmails)
        ? data.userEmails.filter(
            (e: unknown): e is string => typeof e === "string" && Boolean(e),
          )
        : typeof data.userEmail === "string" && data.userEmail
          ? [data.userEmail]
          : [];
      const ignoredIds = new Set(
        messages.filter(isIgnoredTodoEmail).map((m) => m.id),
      );
      const ignoredThreads = new Set(
        messages.filter(isIgnoredTodoEmail).map((m) => m.threadId),
      );
      const done = loadCompleted();
      const found = analyzeEmailsForTodos(messages, done, userEmails);

      setItems((prev) => {
        const byId = new Map<string, EmailTodoItem>();
        for (const item of prev) {
          if (
            done.has(item.id) ||
            done.has(item.threadId) ||
            ignoredIds.has(item.messageId) ||
            ignoredThreads.has(item.threadId) ||
            isIgnoredTodoItem(item)
          ) {
            continue;
          }
          byId.set(item.id, item);
        }
        for (const item of found) {
          const existing = byId.get(item.id);
          if (existing) {
            byId.set(item.id, {
              ...item,
              dueAt: existing.dueAt,
              manual: existing.manual,
            });
          } else {
            byId.set(item.id, item);
          }
        }
        return Array.from(byId.values()).sort(sortTodos);
      });
      setStatus(
        found.length
          ? `Scanned inbox — ${found.length} action item${found.length === 1 ? "" : "s"} found`
          : "Scanned inbox — no new personal actions",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [connected]);

  const runScheduledScanIfDue = useCallback(() => {
    if (!connected) return;
    const due = currentDueScanSlot();
    if (!due) return;
    const last = localStorage.getItem(LAST_SCAN_SLOT_KEY);
    if (last === due) return;
    localStorage.setItem(LAST_SCAN_SLOT_KEY, due);
    void scan();
  }, [connected, scan]);

  useEffect(() => {
    if (!connected || !ready) return;
    runScheduledScanIfDue();
    const id = setInterval(runScheduledScanIfDue, 60 * 1000);
    return () => clearInterval(id);
  }, [connected, ready, runScheduledScanIfDue]);

  const openItems = useMemo(
    () =>
      items
        .filter(
          (item) => !completed.has(item.id) && !completed.has(item.threadId),
        )
        .sort(sortTodos),
    [items, completed],
  );

  useEffect(() => {
    onOpenCount?.(openItems.length);
  }, [openItems.length, onOpenCount]);

  const completeItem = (item: EmailTodoItem) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      if (!item.manual) next.add(item.threadId);
      return next;
    });
    setItems((prev) => prev.filter((t) => t.id !== item.id));
    setStatus("Marked complete — won’t be re-added");
  };

  const setItemDue = (id: string, value: string) => {
    const dueAt = fromDatetimeLocalValue(value);
    setItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, dueAt } : item))
        .sort(sortTodos),
    );
  };

  const addManual = async (e: FormEvent) => {
    e.preventDefault();
    const title = manualTitle.trim();
    if (!title) return;
    const dueAt = fromDatetimeLocalValue(manualDue);
    const now = new Date().toISOString();
    const id = `manual-${Date.now()}`;
    setItems((prev) =>
      [
        {
          id,
          messageId: id,
          threadId: id,
          title,
          from: "You",
          subject: "Manual to-do",
          sourceDate: now,
          dueAt,
          manual: true,
        },
        ...prev,
      ].sort(sortTodos),
    );
    setManualTitle("");
    setManualDue("");

    if (!dueAt) {
      setStatus("Added manual to-do");
      return;
    }

    // Block 30 minutes on the calendar starting at the due time.
    const start = new Date(dueAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          description: "From Comms Hub To Do",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "To-do saved, but calendar event failed");
        setStatus("Added manual to-do (not on calendar)");
        return;
      }
      setError(null);
      setStatus(
        data.demo
          ? "Added to-do + calendar event (demo)"
          : "Added to-do and calendar event",
      );
    } catch {
      setError("To-do saved, but calendar event failed");
      setStatus("Added manual to-do (not on calendar)");
    }
  };

  return (
    <div className="pane-body todo-body">
      <div className="pane-toolbar">
        <button
          type="button"
          className="btn-ghost"
          disabled={scanning || !connected}
          onClick={() => void scan()}
          title={
            connected
              ? "Scan inbox now"
              : "Connect Google to scan inbox"
          }
        >
          {scanning ? "Scanning…" : "Scan inbox"}
        </button>
        <span className="muted scratch-hint">
          Auto: 8am · 12pm · 5:30pm · {openItems.length} open
        </span>
      </div>
      {error && <p className="error-line">{error}</p>}
      {status && <p className="muted todo-status">{status}</p>}
      {!connected && (
        <p className="muted todo-status">
          Connect Google to auto-scan mail. You can still add manual to-dos.
        </p>
      )}

      <div className="todo-scroll">
        <ul className="todo-list">
          {openItems.map((item) => {
            const dueLabel = formatDue(item.dueAt);
            const overdue =
              item.dueAt && new Date(item.dueAt).getTime() < Date.now();
            return (
              <li
                key={item.id}
                className={
                  item.manual ? "todo-row" : "todo-row todo-row-clickable"
                }
              >
                <button
                  type="button"
                  className="todo-main"
                  disabled={item.manual || !onOpenEmail}
                  title={
                    item.manual
                      ? undefined
                      : "Click to preview · Double-click to open in a new window"
                  }
                  onClick={() => {
                    if (item.manual || !onOpenEmail) return;
                    onOpenEmail({
                      messageId: item.messageId,
                      threadId: item.threadId,
                    });
                  }}
                  onDoubleClick={(e) => {
                    if (item.manual) return;
                    e.preventDefault();
                    openMailWindow(item.messageId);
                  }}
                >
                  <p className="todo-title">
                    {item.manual ? item.title : item.subject || item.title}
                  </p>
                  <p className="todo-meta muted">
                    {item.manual ? "Manual" : item.from.split("<")[0].trim()}
                    {" · "}
                    {formatDistanceToNow(new Date(item.sourceDate), {
                      addSuffix: true,
                    })}
                    {dueLabel && (
                      <>
                        {" · "}
                        <span
                          className={overdue ? "todo-due overdue" : "todo-due"}
                        >
                          Due {dueLabel}
                        </span>
                      </>
                    )}
                  </p>
                </button>
                <label
                  className="todo-due-field"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="muted">Due</span>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(item.dueAt)}
                    onChange={(e) => setItemDue(item.id, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary todo-done"
                  onClick={() => completeItem(item)}
                >
                  Done
                </button>
              </li>
            );
          })}
        </ul>
        {openItems.length === 0 && !scanning && (
          <p className="muted cal-empty">No open action items</p>
        )}
      </div>

      <form className="todo-add-form" onSubmit={addManual}>
        <p className="compose-label">Add to-do</p>
        <input
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="What do you need to do?"
          required
        />
        <label className="todo-due-field">
          <span className="muted">Due (optional — also adds a calendar block)</span>
          <input
            type="datetime-local"
            value={manualDue}
            onChange={(e) => setManualDue(e.target.value)}
          />
        </label>
        <div className="compose-actions">
          <button type="submit" className="btn-primary">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
