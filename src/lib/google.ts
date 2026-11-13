import { google } from "googleapis";
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
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: max,
    q: "in:inbox category:primary",
  });

  const ids = list.data.messages || [];
  const messages: GmailMessage[] = [];

  for (const item of ids) {
    if (!item.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: item.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date", "Message-ID"],
    });
    const labels = full.data.labelIds || [];
    // Keep Primary-tab mail only (exclude Social/Promotions/Updates/Forums)
    if (!labels.includes("CATEGORY_PERSONAL")) continue;

    const headers = full.data.payload?.headers;
    const cc = headerValue(headers, "Cc");
    messages.push({
      id: item.id,
      threadId: full.data.threadId || item.id,
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      cc: cc || undefined,
      subject: headerValue(headers, "Subject") || "(no subject)",
      snippet: full.data.snippet || "",
      date: headerValue(headers, "Date") || new Date().toISOString(),
      unread: labels.includes("UNREAD"),
      messageId: headerValue(headers, "Message-ID") || undefined,
    });
  }

  return messages;
}

function encodeRawMessage(lines: string[]) {
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function archiveGmailMessage(id: string) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
}

export async function deleteGmailMessage(id: string) {
  const auth = await getAuthedGoogleClient();
  if (!auth) throw new Error("Google not connected");

  const gmail = google.gmail({ version: "v1", auth });
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

export async function acceptCalendarInvitation(eventId: string) {
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
      a.self ? { ...a, responseStatus: "accepted" } : a,
    ),
  );

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
    requestBody: { attendees: nextAttendees },
  });
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
