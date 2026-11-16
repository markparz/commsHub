import { addHours } from "date-fns";
import { invitationTitleFromSubject } from "./ical";
import { addDemoCalendarEvent } from "./demo-calendar";
import { demoGmail } from "./demo-data";
import type { GmailMessage } from "./types";

let inbox: GmailMessage[] = demoGmail.map((m) => ({ ...m }));

/** One entry per thread — keep the latest message in each conversation. */
export function listDemoGmail(): GmailMessage[] {
  const byThread = new Map<string, GmailMessage>();
  for (const msg of inbox) {
    const existing = byThread.get(msg.threadId);
    if (
      !existing ||
      new Date(msg.date).getTime() >= new Date(existing.date).getTime()
    ) {
      byThread.set(msg.threadId, msg);
    }
  }
  return Array.from(byThread.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function archiveDemoGmail(id: string, threadId?: string): boolean {
  const before = inbox.length;
  if (threadId) {
    inbox = inbox.filter((m) => m.threadId !== threadId);
  } else {
    const msg = inbox.find((m) => m.id === id);
    inbox = msg
      ? inbox.filter((m) => m.threadId !== msg.threadId)
      : inbox.filter((m) => m.id !== id);
  }
  return inbox.length < before;
}

export function deleteDemoGmail(id: string, threadId?: string): boolean {
  return archiveDemoGmail(id, threadId);
}

/** Accept or decline an invite email against the demo calendar. */
export function respondToDemoGmailInvitation(
  id: string,
  response: "accepted" | "declined",
  threadId?: string,
): { ok: true; eventId?: string } | { ok: false } {
  const msg = inbox.find(
    (m) => m.id === id || (threadId ? m.threadId === threadId : false),
  );
  if (!msg?.isInvitation) return { ok: false };

  let eventId: string | undefined;
  if (response === "accepted") {
    const start = addHours(new Date(), 24 * 7);
    const end = addHours(start, 1);
    const event = addDemoCalendarEvent({
      title:
        invitationTitleFromSubject(msg.subject) ||
        msg.subject.replace(/^Invitation:\s*/i, ""),
      start: start.toISOString(),
      end: end.toISOString(),
      description: msg.snippet,
      isInvitation: false,
      attendees: [
        {
          email: "you@example.com",
          displayName: "You",
          self: true,
          responseStatus: "accepted",
        },
        {
          email: msg.from.match(/<([^>]+)>/)?.[1] || "organizer@example.com",
          displayName: msg.from.split("<")[0].trim(),
          responseStatus: "accepted",
        },
      ],
    });
    eventId = event.id;
  }

  archiveDemoGmail(id, threadId || msg.threadId);
  return { ok: true, eventId };
}

export function acceptDemoGmailInvitation(
  id: string,
  threadId?: string,
): { ok: true; eventId?: string } | { ok: false } {
  return respondToDemoGmailInvitation(id, "accepted", threadId);
}

export function declineDemoGmailInvitation(
  id: string,
  threadId?: string,
): { ok: true; eventId?: string } | { ok: false } {
  return respondToDemoGmailInvitation(id, "declined", threadId);
}
