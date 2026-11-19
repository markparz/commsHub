import type { GmailMessage } from "./types";

/**
 * Analysis brief used when deciding whether an email needs a personal to-do.
 * Keep this aligned with the heuristics below (and any future LLM call).
 */
export const EMAIL_TODO_ANALYSIS_PROMPT = `You are helping Mark triage his Primary inbox into personal action items.

For each email, decide if HE personally needs to do something (reply, confirm, approve, RSVP, review, send something, take an action). Ignore FYI-only newsletters, agendas, and mass updates with no ask of him.

If action is needed, output one short imperative line item (max ~14 words), starting with a verb.
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

function fingerprint(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function senderName(from: string) {
  return from.split("<")[0].trim() || from || "Unknown";
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
  return IGNORED_ADDRESSES.some((addr) => haystack.includes(addr));
}

function buildTitle(message: GmailMessage): string | null {
  if (isIgnoredTodoEmail(message)) return null;

  const subject = message.subject.trim();
  const snippet = message.snippet.trim();
  const combined = `${subject} ${snippet}`;

  if (message.isInvitation && !/^cancel+ed:/i.test(subject)) {
    return `RSVP: ${subject.replace(/^(updated\s+)?invitation:\s*/i, "").slice(0, 72)}`;
  }

  if (FYI_ONLY.test(combined) && !ACTION_SUBJECT.test(subject) && !ACTION_BODY.test(snippet)) {
    return null;
  }

  const needsAction =
    ACTION_SUBJECT.test(subject) ||
    ACTION_BODY.test(snippet) ||
    (/^re:/i.test(subject) && message.unread);

  if (!needsAction) return null;

  if (/action required/i.test(subject)) {
    return subject.replace(/^.*action required\s*[-–:]?\s*/i, "Complete: ").slice(0, 100);
  }
  if (/confirm/i.test(combined)) {
    return `Confirm: ${subject.replace(/^(re:|fwd:)\s*/i, "").slice(0, 80)}`;
  }
  if (/approve|sign off/i.test(combined)) {
    return `Approve/review: ${subject.replace(/^(re:|fwd:)\s*/i, "").slice(0, 80)}`;
  }
  if (/please reply|respond|let me know|can you|could you/i.test(combined)) {
    return `Reply to ${senderName(message.from)}: ${subject.replace(/^(re:|fwd:)\s*/i, "").slice(0, 70)}`;
  }
  if (/review/i.test(combined)) {
    return `Review: ${subject.replace(/^(re:|fwd:)\s*/i, "").slice(0, 80)}`;
  }

  return `Follow up: ${subject.slice(0, 90)}`;
}

/** Derive personal to-do items from inbox messages (skips completed ids). */
export function analyzeEmailsForTodos(
  messages: GmailMessage[],
  completedIds: Set<string>,
): EmailTodoItem[] {
  const items: EmailTodoItem[] = [];

  for (const message of messages) {
    const title = buildTitle(message);
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
