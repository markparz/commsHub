export type AuthStatus = {
  google: boolean;
  slack: boolean;
  demo: boolean;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  messageId?: string;
};

export type SlackChannel = {
  id: string;
  name: string;
};

export type SlackMessage = {
  id: string;
  user: string;
  text: string;
  ts: string;
  channelId: string;
};

export type CalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  meetLink?: string;
  attendees?: CalendarAttendee[];
  description?: string;
  /** True when this is a meeting invite awaiting your response. */
  isInvitation?: boolean;
};
