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
