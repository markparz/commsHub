import { addMinutes, addHours } from "date-fns";
import type {
  CalendarEvent,
  GmailMessage,
  SlackChannel,
  SlackMessage,
} from "./types";

export const demoChannels: SlackChannel[] = [
  { id: "C01", name: "general" },
  { id: "C02", name: "product" },
  { id: "C03", name: "engineering" },
];

export const demoSlackMessages: Record<string, SlackMessage[]> = {
  C01: [
    {
      id: "1",
      user: "Alex",
      text: "Morning — standup notes are in the doc.",
      ts: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      channelId: "C01",
    },
    {
      id: "2",
      user: "Jordan",
      text: "Thanks — I'll share the design update after lunch.",
      ts: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
      channelId: "C01",
    },
    {
      id: "3",
      user: "Sam",
      text: "Reminder: customer call at :45.",
      ts: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      channelId: "C01",
    },
  ],
  C02: [
    {
      id: "4",
      user: "Maya",
      text: "Ship checklist looks good for Thursday.",
      ts: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      channelId: "C02",
    },
  ],
  C03: [
    {
      id: "5",
      user: "Chris",
      text: "PR #482 is ready for a second look.",
      ts: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      channelId: "C03",
    },
  ],
};

export const demoGmail: GmailMessage[] = [
  {
    id: "m1",
    threadId: "t1",
    from: "Priya Chen <priya@acme.co>",
    to: "you@example.com, Alex Kim <alex@acme.co>",
    cc: "Maya Singh <maya@acme.co>",
    subject: "Q2 roadmap sync follow-ups",
    snippet:
      "Capturing action items from yesterday — can you own the timeline doc?",
    date: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    unread: true,
    messageId: "<m1@demo.comms-hub>",
  },
  {
    id: "m2",
    threadId: "t2",
    from: "Notion <noreply@notion.so>",
    to: "you@example.com",
    subject: "You were mentioned in Comms Hub",
    snippet: "Alex left a comment on the launch brief.",
    date: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    unread: true,
    messageId: "<m2@demo.comms-hub>",
  },
  {
    id: "m3",
    threadId: "t3",
    from: "Lee Ortiz <lee@partners.io>",
    to: "you@example.com",
    cc: "partners@partners.io",
    subject: "Re: Integration kickoff",
    snippet: "Works for me — let's lock Thursday afternoon.",
    date: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
    unread: false,
    messageId: "<m3@demo.comms-hub>",
  },
];

/** Builds calendar events including one that starts in ~2 minutes for demo alerts. */
export function buildDemoCalendar(): CalendarEvent[] {
  const soon = addMinutes(new Date(), 2);
  const later = addHours(new Date(), 3);
  const afternoon = addHours(new Date(), 5);

  return [
    {
      id: "e-soon",
      title: "Demo: 1-min alert test",
      start: soon.toISOString(),
      end: addMinutes(soon, 25).toISOString(),
      location: "Zoom",
      meetLink: "https://meet.google.com/demo-alert",
      attendees: [
        {
          email: "you@example.com",
          displayName: "You",
          responseStatus: "accepted",
          self: true,
        },
        {
          email: "sam@example.com",
          displayName: "Sam",
          responseStatus: "accepted",
        },
      ],
      description:
        "Short demo meeting used to verify the 1-minute alert banner and sound.",
    },
    {
      id: "e2",
      title: "Product design review",
      start: later.toISOString(),
      end: addMinutes(later, 45).toISOString(),
      location: "Room 4B",
      attendees: [
        {
          email: "maya@acme.co",
          displayName: "Maya",
          responseStatus: "accepted",
        },
        {
          email: "you@example.com",
          displayName: "You",
          responseStatus: "accepted",
          self: true,
        },
        {
          email: "alex@acme.co",
          displayName: "Alex",
          responseStatus: "needsAction",
        },
      ],
      description:
        "Walk through the latest Comms Hub panel layouts and approve the ship checklist.",
    },
    {
      id: "e3",
      title: "Customer kickoff — Acme",
      start: afternoon.toISOString(),
      end: addMinutes(afternoon, 60).toISOString(),
      meetLink: "https://meet.google.com/abc-defg-hij",
      attendees: [
        {
          email: "lee@partners.io",
          displayName: "Lee Ortiz",
          responseStatus: "accepted",
        },
        {
          email: "you@example.com",
          displayName: "You",
          responseStatus: "needsAction",
          self: true,
        },
        {
          email: "priya@acme.co",
          displayName: "Priya Chen",
          responseStatus: "tentative",
        },
      ],
      description:
        "Kickoff agenda: goals, integration timeline, and success metrics for the Acme pilot.",
      isInvitation: true,
    },
  ];
}
