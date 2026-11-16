import { google } from "googleapis";
import {
  invitationTitleFromSubject,
  isCalendarInvitationSubject,
  parseIcsInvite,
  type ParsedInvite,
} from "./ical";
import { getSession } from "./session";
import type { CalendarEvent, GmailMessage } from "./types";

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
  );
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export async function getAuthedGoogleClient() {
  const session = await getSession();
  if (!session.googleAccessToken) return null;

  const client = getGoogleOAuthClient();
  client.setCredentials({
    access_token: session.googleAccessToken,
    refresh_token: session.googleRefreshToken,
    expiry_date: session.googleExpiry,
  });

  client.on("tokens", async (tokens) => {
    if (tokens.access_token) session.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) session.googleRefreshToken = tokens.refresh_token;
    if (tokens.expiry_date) session.googleExpiry = tokens.expiry_date;
    await session.save();
  });

  return client;
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string,
) {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

export async function listGmailMessages(max = 20): Promise<GmailMessage[]> {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  // One row per conversation — list threads, not individual messages
  const list = await gmail.users.threads.list({
    userId: "me",
    maxResults: max,
    q: "in:inbox category:primary",
  });

  const threads = list.data.threads || [];
  const messages: GmailMessage[] = [];

  for (const item of threads) {
    if (!item.id) continue;
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: item.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date", "Message-ID"],
    });

    const threadMessages = thread.data.messages || [];
    if (threadMessages.length === 0) continue;

    const latest = threadMessages[threadMessages.length - 1];
    const labels = latest.labelIds || [];
    const threadUnread = threadMessages.some((m) =>
      (m.labelIds || []).includes("UNREAD"),
    );
    // Keep Primary-tab mail only (exclude Social/Promotions/Updates/Forums)
    const isPrimary = threadMessages.some((m) =>
      (m.labelIds || []).includes("CATEGORY_PERSONAL"),
    );
    if (!isPrimary) continue;

    const headers = latest.payload?.headers;
    const cc = headerValue(headers, "Cc");
    const subject = headerValue(headers, "Subject") || "(no subject)";
    messages.push({
      id: latest.id || item.id,
      threadId: item.id,
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      cc: cc || undefined,
      subject,
      snippet: latest.snippet || thread.data.snippet || "",
      date: headerValue(headers, "Date") || new Date().toISOString(),
      unread: threadUnread || labels.includes("UNREAD"),
      messageId: headerValue(headers, "Message-ID") || undefined,
      isInvitation: isCalendarInvitationSubject(subject),
    });
  }

  return messages;
}

type MimePart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null } | null;
  parts?: MimePart[] | null;
};

function decodeBase64Url(data: string) {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function findCalendarParts(part: MimePart | undefined | null): MimePart[] {
  if (!part) return [];
  const out: MimePart[] = [];
  const mime = (part.mimeType || "").toLowerCase();
  const name = (part.filename || "").toLowerCase();
  if (mime.includes("text/calendar") || name.endsWith(".ics")) {
    out.push(part);
  }
  for (const child of part.parts || []) {
    out.push(...findCalendarParts(child));
  }
  return out;
}

async function loadMessageIcs(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
): Promise<string | null> {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const parts = findCalendarParts(full.data.payload as MimePart);
  for (const part of parts) {
    if (part.body?.data) return decodeBase64Url(part.body.data);
    if (part.body?.attachmentId) {
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: part.body.attachmentId,
      });
      if (att.data.data) return decodeBase64Url(att.data.data);
    }
  }
  return null;
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findInvitationEventId(
  calendar: ReturnType<typeof google.calendar>,
  invite: ParsedInvite,
  subject: string,
): Promise<string | undefined> {
  if (invite.uid) {
    const byUid = await calendar.events.list({
      calendarId: "primary",
      iCalUID: invite.uid,
      maxResults: 5,
      showDeleted: false,
    });
    const hit = byUid.data.items?.find((ev) => ev.id);
    if (hit?.id) return hit.id;
  }

  const title =
    invite.summary || invitationTitleFromSubject(subject) || undefined;
  if (!title) return undefined;

  const windowStart = invite.start
    ? new Date(new Date(invite.start).getTime() - 1000 * 60 * 60 * 24)
    : new Date();
  const windowEnd = invite.end
    ? new Date(new Date(invite.end).getTime() + 1000 * 60 * 60 * 24)
    : new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);

  const listed = await calendar.events.list({
    calendarId: "primary",
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    singleEvents: true,
    maxResults: 50,
    q: title,
  });

  const wanted = normalizeTitle(title);
  const match = (listed.data.items || []).find((ev) => {
    const summary = normalizeTitle(ev.summary || "");
    if (summary !== wanted && !summary.includes(wanted)) return false;
    const self = ev.attendees?.find((a) => a.self);
    return !self || self.responseStatus === "needsAction";
  });
  return match?.id || undefined;
}

async function importInviteAsEvent(
  calendar: ReturnType<typeof google.calendar>,
  invite: ParsedInvite,
  subject: string,
): Promise<string> {
  if (!invite.start || !invite.end) {
    throw new Error("Invitation is missing start/end times");
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(invite.start);
  const summary =
    invite.summary ||
    invitationTitleFromSubject(subject) ||
    subject ||
    "Accepted invitation";

  const attendees = Array.from(
    new Set(
      [
        ...(invite.organizerEmail ? [invite.organizerEmail] : []),
        ...invite.attendeeEmails,
      ].map((e) => e.toLowerCase()),
    ),
  ).map((email) => ({
    email,
    responseStatus:
      email === invite.organizerEmail ? "accepted" : "needsAction",
  }));

  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary,
      description: invite.description,
      location: invite.location,
      ...(invite.uid ? { iCalUID: invite.uid } : {}),
      start: isAllDay
        ? { date: invite.start }
        : {
            dateTime: invite.start.includes("T")
              ? invite.start
              : `${invite.start}T09:00:00`,
            timeZone,
          },
      end: isAllDay
        ? { date: invite.end }
        : {
            dateTime: invite.end.includes("T")
              ? invite.end
              : `${invite.end}T10:00:00`,
            timeZone,
          },
      attendees,
      status: "confirmed",
    },
  });

  if (!res.data.id) throw new Error("Failed to add invitation to calendar");
  return res.data.id;
}

/**
 * RSVP to a calendar invite from Gmail.
 * Accept: add/find the event, mark accepted, archive the email.
 * Decline: decline on calendar if present (do not add), archive the email.
 */
export async function respondToGmailInvitation(
  messageId: string,
  response: "accepted" | "declined",
  threadId?: string,
): Promise<{ eventId?: string }> {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  const calendar = google.calendar({ version: "v3", auth });

  const meta = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject"],
  });
  const subject = headerValue(meta.data.payload?.headers, "Subject");

  const ics = await loadMessageIcs(gmail, messageId);
  const invite = ics ? parseIcsInvite(ics) : { attendeeEmails: [] as string[] };

  let eventId = await findInvitationEventId(calendar, invite, subject);

  if (response === "accepted") {
    if (!eventId) {
      if (!ics || !invite.start || !invite.end) {
        throw new Error(
          "Could not find a calendar invite on this email. Open it in Calendar to accept.",
        );
      }
      eventId = await importInviteAsEvent(calendar, invite, subject);
    }
    try {
      await respondToCalendarInvitation(eventId, "accepted");
    } catch {
      // Event may have been inserted without self as attendee — still on calendar
    }
  } else if (eventId) {
    try {
      await respondToCalendarInvitation(eventId, "declined");
    } catch {
      // Still archive the invite email even if calendar RSVP fails
    }
  }

  await archiveGmailMessage(
    messageId,
    threadId || meta.data.threadId || undefined,
  );
  return { eventId };
}

export async function acceptGmailInvitation(
  messageId: string,
  threadId?: string,
): Promise<{ eventId?: string }> {
  return respondToGmailInvitation(messageId, "accepted", threadId);
}

export async function declineGmailInvitation(
  messageId: string,
  threadId?: string,
): Promise<{ eventId?: string }> {
  return respondToGmailInvitation(messageId, "declined", threadId);
}

function encodeRawMessage(lines: string[]) {
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function archiveGmailMessage(id: string, threadId?: string) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  if (threadId) {
    await gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    return;
  }
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
}

export async function deleteGmailMessage(id: string, threadId?: string) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  if (threadId) {
    await gmail.users.threads.trash({ userId: "me", id: threadId });
    return;
  }
  await gmail.users.messages.trash({ userId: "me", id });
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  body: string,
  options?: { threadId?: string; inReplyTo?: string; cc?: string },
) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (options?.cc?.trim()) {
    headers.splice(1, 0, `Cc: ${options.cc.trim()}`);
  }
  if (options?.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
    headers.push(`References: ${options.inReplyTo}`);
  }

  const encoded = encodeRawMessage([...headers, "", body]);

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      // Only keep replies in the original thread; forwards are a new message
      threadId: options?.inReplyTo ? options.threadId : undefined,
    },
  });
}

export async function listCalendarEvents(
  timeMin = new Date(),
  timeMax?: Date,
): Promise<CalendarEvent[]> {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const calendar = google.calendar({ version: "v3", auth });
  const end =
    timeMax || new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 40,
  });

  return (res.data.items || []).map((ev) => {
    const selfAttendee = ev.attendees?.find((a) => a.self);
    // Pending RSVP — show Accept/Delete in the calendar preview
    const isInvitation = selfAttendee?.responseStatus === "needsAction";

    return {
      id: ev.id || crypto.randomUUID(),
      title: ev.summary || "(no title)",
      start: ev.start?.dateTime || ev.start?.date || "",
      end: ev.end?.dateTime || ev.end?.date || "",
      location: ev.location || undefined,
      meetLink: ev.hangoutLink || undefined,
      attendees: (ev.attendees || [])
        .filter((a) => Boolean(a.email))
        .map((a) => ({
          email: a.email!,
          displayName: a.displayName || undefined,
          responseStatus: a.responseStatus as
            | "needsAction"
            | "declined"
            | "tentative"
            | "accepted"
            | undefined,
          self: a.self || undefined,
        })),
      description: ev.description || undefined,
      isInvitation,
    };
  });
}

/** Keep events that have not ended yet (in-progress stays visible). */
export function filterUpcomingEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = Date.now();
  return events.filter((ev) => {
    const end = new Date(ev.end || ev.start).getTime();
    if (Number.isNaN(end)) return true;
    return end > now;
  });
}

function sanitizeAttendees(
  attendees: {
    email?: string | null;
    displayName?: string | null;
    optional?: boolean | null;
    responseStatus?: string | null;
    organizer?: boolean | null;
    self?: boolean | null;
    resource?: boolean | null;
    comment?: string | null;
    additionalGuests?: number | null;
  }[],
) {
  return attendees
    .filter((a) => Boolean(a.email))
    .map((a) => ({
      email: a.email!,
      ...(a.displayName ? { displayName: a.displayName } : {}),
      ...(a.optional != null ? { optional: a.optional } : {}),
      ...(a.responseStatus ? { responseStatus: a.responseStatus } : {}),
      ...(a.organizer != null ? { organizer: a.organizer } : {}),
      ...(a.self != null ? { self: a.self } : {}),
      ...(a.resource != null ? { resource: a.resource } : {}),
      ...(a.comment ? { comment: a.comment } : {}),
      ...(a.additionalGuests != null
        ? { additionalGuests: a.additionalGuests }
        : {}),
    }));
}

export async function respondToCalendarInvitation(
  eventId: string,
  response: "accepted" | "declined",
) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const calendar = google.calendar({ version: "v3", auth });
  const existing = await calendar.events.get({
    calendarId: "primary",
    eventId,
  });

  const attendees = existing.data.attendees || [];
  if (!attendees.some((a) => a.self)) {
    throw new Error("You are not listed as an attendee on this invitation");
  }

  const nextAttendees = sanitizeAttendees(
    attendees.map((a) =>
      a.self ? { ...a, responseStatus: response } : a,
    ),
  );

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
    requestBody: { attendees: nextAttendees },
  });
}

export async function acceptCalendarInvitation(eventId: string) {
  return respondToCalendarInvitation(eventId, "accepted");
}

export async function declineCalendarInvitation(eventId: string) {
  return respondToCalendarInvitation(eventId, "declined");
}

export async function deleteCalendarEvent(eventId: string) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
  });
}

export type NewCalendarEvent = {
  title: string;
  start: string;
  end: string;
  location?: string;
  attendees?: (string | { email: string })[];
  description?: string;
};

export async function createCalendarEvent(
  input: NewCalendarEvent,
): Promise<CalendarEvent> {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const calendar = google.calendar({ version: "v3", auth });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: input.title,
      location: input.location || undefined,
      description: input.description || undefined,
      start: { dateTime: input.start, timeZone },
      end: { dateTime: input.end, timeZone },
      attendees: input.attendees?.map((email) =>
        typeof email === "string" ? { email } : { email: email.email },
      ),
    },
  });

  const ev = res.data;
  return {
    id: ev.id || crypto.randomUUID(),
    title: ev.summary || input.title,
    start: ev.start?.dateTime || input.start,
    end: ev.end?.dateTime || input.end,
    location: ev.location || input.location,
    meetLink: ev.hangoutLink || undefined,
    attendees: (ev.attendees || [])
      .filter((a) => Boolean(a.email))
      .map((a) => ({
        email: a.email!,
        displayName: a.displayName || undefined,
        responseStatus: a.responseStatus as
          | "needsAction"
          | "declined"
          | "tentative"
          | "accepted"
          | undefined,
        self: a.self || undefined,
      })),
    description: ev.description || input.description,
  };
}
