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

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  meetLink?: string;
  attendees?: string[];
};
