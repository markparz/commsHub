/** Minimal iCalendar helpers for accepting meeting invites from email. */

export function isCalendarInvitationSubject(subject: string): boolean {
  const s = subject.trim();
  if (/^cancel+ed:/i.test(s)) return false;
  return /^(updated\s+)?invitation:/i.test(s);
}

/** Strip Gmail's "Invitation: … @ date (name)" wrapper to the event title. */
export function invitationTitleFromSubject(subject: string): string | null {
  const s = subject.trim();
  if (/^cancel+ed:/i.test(s)) return null;
  const match = s.match(/^(?:updated\s+)?invitation:\s*(.+)$/i);
  if (!match) return null;
  const rest = match[1].trim();
  const at = rest.lastIndexOf(" @ ");
  if (at > 0) return rest.slice(0, at).trim();
  return rest;
}

export type ParsedInvite = {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  organizerEmail?: string;
  attendeeEmails: string[];
};

function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function icsProp(line: string, name: string): string | null {
  const upper = line.toUpperCase();
  const key = name.toUpperCase();
  if (!upper.startsWith(key)) return null;
  if (upper[key.length] !== ":" && upper[key.length] !== ";") return null;
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  return line.slice(colon + 1).trim();
}

function mailtoEmail(value: string): string | undefined {
  const m = value.match(/mailto:([^\s>;]+)/i);
  return m?.[1]?.toLowerCase();
}

/** Convert ICS date (UTC or floating) to ISO-ish string for Calendar API. */
export function icsDateToIso(value: string): string | undefined {
  const raw = value.trim();
  // YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const m = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return m[7] ? `${iso}Z` : iso;
}

export function parseIcsInvite(ics: string): ParsedInvite {
  const text = unfoldIcs(ics);
  const lines = text.split(/\r?\n/);
  let inEvent = false;
  const invite: ParsedInvite = { attendeeEmails: [] };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (upper === "END:VEVENT") break;
    if (!inEvent) continue;

    const uid = icsProp(line, "UID");
    if (uid) {
      invite.uid = uid;
      continue;
    }
    const summary = icsProp(line, "SUMMARY");
    if (summary) {
      invite.summary = summary.replace(/\\n/g, "\n").replace(/\\,/g, ",");
      continue;
    }
    const description = icsProp(line, "DESCRIPTION");
    if (description) {
      invite.description = description
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",");
      continue;
    }
    const location = icsProp(line, "LOCATION");
    if (location) {
      invite.location = location.replace(/\\,/g, ",");
      continue;
    }
    if (upper.startsWith("DTSTART")) {
      const v = icsProp(line, "DTSTART");
      if (v) invite.start = icsDateToIso(v);
      continue;
    }
    if (upper.startsWith("DTEND")) {
      const v = icsProp(line, "DTEND");
      if (v) invite.end = icsDateToIso(v);
      continue;
    }
    if (upper.startsWith("ORGANIZER")) {
      const email = mailtoEmail(line);
      if (email) invite.organizerEmail = email;
      continue;
    }
    if (upper.startsWith("ATTENDEE")) {
      const email = mailtoEmail(line);
      if (email) invite.attendeeEmails.push(email);
    }
  }

  return invite;
}
