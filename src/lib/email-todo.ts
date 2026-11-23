import { extractEmail, parseAddressList } from "./email";
import type { GmailMessage } from "./types";

/**
 * Analysis brief used when deciding whether an email needs a personal to-do.
 * Keep this aligned with the heuristics below (and any future LLM call).
 */
export const EMAIL_TODO_ANALYSIS_PROMPT = `You are helping Mark triage his Primary inbox into personal action items.

For each email, decide if HE personally needs to do something (reply, confirm, approve, RSVP, review, send something, take an action). Ignore FYI-only newsletters, agendas, and mass updates with no ask of him.

Also treat mail as action-needed when HIS address or Gmail alias is explicitly on the To line of the latest message in the thread (not merely Cc), unless it is clearly FYI/automated or he sent it himself.

If action is needed, use the email subject as the to-do label (nothing else).
If no personal action is needed, output nothing for that email.
Never recreate an item that was already completed.`;

export type EmailTodoItem = {
  /** Stable id: messageId + action fingerprint — used to prevent re-adding completed items */
  id: string;
  messageId: string;
  threadId: string;
  title: string;
  from: string;
  subject: string;
  sourceDate: string;
  /** ISO datetime when the item is due (optional). */
  dueAt?: string;
  /** True when the user created this item manually. */
  manual?: boolean;
};

const ACTION_SUBJECT =
  /\b(action required|please (confirm|review|approve|respond|reply|complete)|need(s)? (your|you to)|can you|could you|waiting on you|asap|deadline|rsvp|confirm your|approve|sign off|follow[- ]?up needed)\b/i;

const ACTION_BODY =
  /\b(please (confirm|review|approve|respond|reply|let me know|send|complete|fill)|can you|could you|need you to|would you|action required|waiting (on|for) you|by (eod|end of day|friday|monday|tomorrow)|\brsvp\b)\b/i;

const FYI_ONLY =
  /\b(daily agenda|newsletter|noreply|no[- ]reply|do not reply|automated|notification only)\b/i;

const IGNORED_ADDRESSES = ["memo-list@redhat.com"];

const IGNORED_SUBJECTS = ["you have no events scheduled today."];

function fingerprint(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function isIgnoredTodoSubject(subject: string): boolean {
  const normalized = subject.trim().toLowerCase();
  return IGNORED_SUBJECTS.some((s) => normalized === s || normalized.includes(s));
}

export function isIgnoredTodoEmail(message: GmailMessage): boolean {
  // Include subject so tags like "[memo-list]" are caught even if Cc
  // wasn't copied onto the newest reply in the thread.
  const haystack = [
    message.from,
    message.to,
    message.cc || "",
    message.subject,
  ]
    .join(" ")
    .toLowerCase();
  if (/\bmemo-list\b/.test(haystack)) return true;
  if (isIgnoredTodoSubject(message.subject)) return true;
  return IGNORED_ADDRESSES.some((addr) => haystack.includes(addr));
}

function normalizeUserEmails(
  userEmails: string | string[] | null | undefined,
): string[] {
  if (!userEmails) return [];
  const list = Array.isArray(userEmails) ? userEmails : [userEmails];
  return list
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when a user address/alias appears on the latest message To header (not Cc). */
export function isAddressedToUser(
  message: GmailMessage,
  userEmails: string | string[] | null | undefined,
): boolean {
  const mine = new Set(normalizeUserEmails(userEmails));
  if (mine.size === 0) return false;
  const from = extractEmail(message.from).toLowerCase();
  // Own outbound messages shouldn't become to-dos via this rule.
  if (mine.has(from)) return false;
  return parseAddressList(message.to).some((addr) =>
    mine.has(addr.toLowerCase()),
  );
}

function buildTitle(
  message: GmailMessage,
  userEmails?: string | string[] | null,
): string | null {
  if (isIgnoredTodoEmail(message)) return null;

  const subject = message.subject.trim();
  const snippet = message.snippet.trim();
  const combined = `${subject} ${snippet}`;
  const addressedToMe = isAddressedToUser(message, userEmails);

  if (message.isInvitation && !/^cancel+ed:/i.test(subject)) {
    return subject || "Calendar invitation";
  }

  // Skip clear automated/noreply mail even when To includes me.
  if (
    FYI_ONLY.test(combined) &&
    !ACTION_SUBJECT.test(subject) &&
    !ACTION_BODY.test(snippet)
  ) {
    return null;
  }

  const needsAction =
    ACTION_SUBJECT.test(subject) ||
    ACTION_BODY.test(snippet) ||
    (/^re:/i.test(subject) && message.unread) ||
    addressedToMe;

  if (!needsAction) return null;

  // Display label is the email subject only.
  return subject || "(no subject)";
}

/** Derive personal to-do items from inbox messages (skips completed ids). */
export function analyzeEmailsForTodos(
  messages: GmailMessage[],
  completedIds: Set<string>,
  userEmails?: string | string[] | null,
): EmailTodoItem[] {
  const items: EmailTodoItem[] = [];

  for (const message of messages) {
    const title = buildTitle(message, userEmails);
    if (!title) continue;

    const id = `${message.threadId}:${fingerprint(title)}`;
    if (completedIds.has(id) || completedIds.has(message.threadId)) continue;

    items.push({
      id,
      messageId: message.id,
      threadId: message.threadId,
      title,
      from: message.from,
      subject: message.subject,
      sourceDate: message.date,
    });
  }

  return items;
}
