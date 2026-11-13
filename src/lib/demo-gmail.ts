import { demoGmail } from "./demo-data";
import type { GmailMessage } from "./types";

let inbox: GmailMessage[] = demoGmail.map((m) => ({ ...m }));

export function listDemoGmail(): GmailMessage[] {
  return inbox;
}

export function archiveDemoGmail(id: string): boolean {
  const before = inbox.length;
  inbox = inbox.filter((m) => m.id !== id);
  return inbox.length < before;
}

export function deleteDemoGmail(id: string): boolean {
  return archiveDemoGmail(id);
}
