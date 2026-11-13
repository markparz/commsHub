"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import type { GmailMessage } from "@/lib/types";
import {
  extractEmail,
  forwardSubject,
  forwardedBody,
  quotedReplyBody,
  replyAllRecipients,
  replySubject,
} from "@/lib/email";
import { usePersistedNumber } from "@/hooks/usePersistedNumber";
import { ResizeHandle } from "./ResizeHandle";

const MIN_PREVIEW = 22;
const MAX_PREVIEW = 75;
const MAIL_REFRESH_MS = 2 * 60 * 1000;
const MAX_DESC_WORDS = 40;

function parseMailDate(value: string): Date {
  const parsed = new Date(value);
  if (isValid(parsed)) return parsed;
  const iso = parseISO(value);
  return isValid(iso) ? iso : new Date();
}

function formatReceivedAt(value: string): string {
  return format(parseMailDate(value), "MMM d, yyyy · h:mma");
}

function briefDescription(snippet: string, maxWords = MAX_DESC_WORDS): string {
  const words = snippet.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "No preview available.";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

type ComposeMode = "new" | "reply" | "reply-all" | "forward";

const MODE_LABEL: Record<ComposeMode, string> = {
  new: "New message",
  reply: "Reply",
  "reply-all": "Reply all",
  forward: "Forward",
};

const SEND_LABEL: Record<ComposeMode, string> = {
  new: "Send",
  reply: "Send reply",
  "reply-all": "Send reply all",
  forward: "Send forward",
};

export function GmailPane({ connected }: { connected: boolean }) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selected, setSelected] = useState<GmailMessage | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>();
  const [replyInReplyTo, setReplyInReplyTo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [previewPct, setPreviewPct] = usePersistedNumber(
    "comms-hub-mail-preview",
    42,
  );

  const load = useCallback(() => {
    fetch("/api/gmail/messages")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: GmailMessage[] = data.messages || [];
        setMessages(list);
        setSelected((prev) =>
          prev
            ? list.find(
                (m) =>
                  m.threadId === prev.threadId || m.id === prev.id,
              ) || null
            : null,
        );
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!connected) return;
    load();
    const id = setInterval(load, MAIL_REFRESH_MS);
    return () => clearInterval(id);
  }, [connected, load]);

  const dragPreview = useCallback(
    (deltaPx: number) => {
      const height = layoutRef.current?.clientHeight || 1;
      const deltaPct = (deltaPx / height) * 100;
      setPreviewPct((prev) =>
        Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, prev - deltaPct)),
      );
    },
    [setPreviewPct],
  );

  const resetComposeFields = () => {
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    setReplyThreadId(undefined);
    setReplyInReplyTo(undefined);
  };

  const startCompose = () => {
    setComposeMode("new");
    resetComposeFields();
    setError(null);
  };

  const startReply = (message: GmailMessage) => {
    setComposeMode("reply");
    setTo(extractEmail(message.from));
    setCc("");
    setSubject(replySubject(message.subject));
    setBody(quotedReplyBody(message));
    setReplyThreadId(message.threadId);
    setReplyInReplyTo(message.messageId);
    setError(null);
  };

  const startReplyAll = (message: GmailMessage) => {
    const recipients = replyAllRecipients(message);
    setComposeMode("reply-all");
    setTo(recipients.to);
    setCc(recipients.cc);
    setSubject(replySubject(message.subject));
    setBody(quotedReplyBody(message));
    setReplyThreadId(message.threadId);
    setReplyInReplyTo(message.messageId);
    setError(null);
  };

  const startForward = (message: GmailMessage) => {
    setComposeMode("forward");
    setTo("");
    setCc("");
    setSubject(forwardSubject(message.subject));
    setBody(forwardedBody(message));
    setReplyThreadId(undefined);
    setReplyInReplyTo(undefined);
    setError(null);
  };

  const cancelCompose = () => {
    setComposeMode(null);
    resetComposeFields();
  };

  const removeFromList = (msg: GmailMessage) => {
    setMessages((prev) =>
      prev.filter((m) => m.threadId !== msg.threadId && m.id !== msg.id),
    );
    if (
      selected &&
      (selected.threadId === msg.threadId || selected.id === msg.id)
    ) {
      setSelected(null);
      setComposeMode(null);
    }
  };

  const runMailAction = async (
    msg: GmailMessage,
    action: "archive" | "delete",
  ) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/messages/${msg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, threadId: msg.threadId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${action} failed`);
        return;
      }
      removeFromList(msg);
      setStatus(
        action === "archive"
          ? data.demo
            ? "Archived (demo)"
            : "Archived"
          : data.demo
            ? "Deleted (demo)"
            : "Moved to trash",
      );
    } finally {
      setActing(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          subject,
          body,
          threadId: replyThreadId,
          inReplyTo: replyInReplyTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Send failed");
        return;
      }
      const labels: Record<ComposeMode, string> = {
        new: data.demo ? "Sent (demo mode)" : "Sent",
        reply: data.demo ? "Reply sent (demo)" : "Reply sent",
        "reply-all": data.demo ? "Reply all sent (demo)" : "Reply all sent",
        forward: data.demo ? "Forwarded (demo)" : "Forwarded",
      };
      setStatus(labels[composeMode || "new"]);
      cancelCompose();
    } finally {
      setSending(false);
    }
  };

  if (!connected) {
    return (
      <div className="pane-empty">
        <p>Connect Google to browse Gmail and Calendar.</p>
        <a className="btn-primary" href="/api/auth/google">
          Connect Google
        </a>
      </div>
    );
  }

  const showCc =
    composeMode === "reply-all" ||
    composeMode === "forward" ||
    composeMode === "new" ||
    Boolean(cc);

  return (
    <div
      className="pane-body mail-layout"
      ref={layoutRef}
      style={
        {
          "--mail-preview": `${previewPct}%`,
        } as CSSProperties
      }
    >
      <div className="mail-list-col">
        <div className="pane-toolbar">
          <button type="button" className="btn-ghost" onClick={startCompose}>
            Compose
          </button>
          <button type="button" className="btn-ghost" onClick={load}>
            Refresh
          </button>
        </div>
        {error && <p className="error-line">{error}</p>}
        {status && <p className="muted">{status}</p>}
        <ul className="mail-list">
          {messages.map((m, index) => (
            <li key={m.threadId} className="mail-list-entry">
              {index > 0 && (
                <div className="mail-link" aria-hidden="true">
                  <span className="mail-link-line" />
                </div>
              )}
              <button
                type="button"
                className={
                  selected?.id === m.id
                    ? "mail-item active"
                    : m.unread
                      ? "mail-item unread"
                      : "mail-item"
                }
                onClick={() => {
                  setSelected(m);
                  if (
                    composeMode !== "reply" &&
                    composeMode !== "reply-all" &&
                    composeMode !== "forward"
                  ) {
                    setComposeMode(null);
                  }
                }}
              >
                <span className="mail-from">{m.from.split("<")[0].trim()}</span>
                <span className="mail-subject">{m.subject}</span>
                <span className="mail-time">
                  {formatReceivedAt(m.date)}
                  <span className="mail-time-rel">
                    {" · "}
                    {formatDistanceToNow(parseMailDate(m.date), {
                      addSuffix: true,
                    })}
                  </span>
                </span>
                <span className="mail-desc">{briefDescription(m.snippet)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ResizeHandle
        orientation="horizontal"
        label="Resize email preview"
        onDrag={dragPreview}
      />

      <div className="mail-detail">
        {composeMode ? (
          <form className="compose-form" onSubmit={send}>
            <p className="compose-label">{MODE_LABEL[composeMode]}</p>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="To"
              required
              autoFocus={composeMode === "forward"}
            />
            {showCc && (
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Cc"
              />
            )}
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              required
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                composeMode === "forward"
                  ? "Add a note above the forwarded message…"
                  : composeMode === "reply" || composeMode === "reply-all"
                    ? "Write your reply…"
                    : "Write your message…"
              }
              rows={8}
              required
              autoFocus={composeMode !== "forward"}
            />
            <div className="compose-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={sending}
              >
                {sending ? "Sending…" : SEND_LABEL[composeMode]}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={cancelCompose}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : selected ? (
          <article>
            <h3>{selected.subject}</h3>
            <p className="msg-meta">
              <strong>{selected.from}</strong>
              <span>
                {formatDistanceToNow(new Date(selected.date), {
                  addSuffix: true,
                })}
              </span>
            </p>
            {(selected.to || selected.cc) && (
              <p className="mail-recipients muted">
                {selected.to && <span>To: {selected.to}</span>}
                {selected.cc && <span>Cc: {selected.cc}</span>}
              </p>
            )}
            <p className="mail-snippet">{selected.snippet}</p>
            <div className="compose-actions mail-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => startReply(selected)}
              >
                Reply
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => startReplyAll(selected)}
              >
                Reply all
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => startForward(selected)}
              >
                Forward
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={acting}
                onClick={() => runMailAction(selected, "archive")}
              >
                Archive
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={acting}
                onClick={() => {
                  if (
                    window.confirm(
                      "Move this email to trash? You can recover it from Gmail Trash.",
                    )
                  ) {
                    void runMailAction(selected, "delete");
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ) : (
          <p className="muted">Select a message</p>
        )}
      </div>
    </div>
  );
}
