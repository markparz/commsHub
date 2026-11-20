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
import type { GmailMessage, GmailMessageDetail } from "@/lib/types";
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
const MAIL_REFRESH_MS = 10 * 60 * 1000;
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

function emailSrcDoc(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><base target="_blank" /><style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#132019;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#1f6f5b}</style></head><body>${html}</body></html>`;
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

export type FocusMailRequest = {
  messageId: string;
  threadId: string;
  nonce: number;
};

export type GmailInboxCounts = {
  unread: number;
  total: number;
};

export function GmailPane({
  connected,
  focusRequest = null,
  onInboxCounts,
}: {
  connected: boolean;
  focusRequest?: FocusMailRequest | null;
  onInboxCounts?: (counts: GmailInboxCounts | null) => void;
}) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selected, setSelected] = useState<GmailMessage | null>(null);
  const [detail, setDetail] = useState<GmailMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [inboxCounts, setInboxCounts] = useState<GmailInboxCounts | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<GmailMessage[]>([]);
  const inboxCountsRef = useRef<GmailInboxCounts | null>(null);
  const [previewPct, setPreviewPct] = usePersistedNumber(
    "comms-hub-mail-preview",
    42,
  );
  messagesRef.current = messages;
  inboxCountsRef.current = inboxCounts;

  const publishCounts = useCallback(
    (counts: GmailInboxCounts | null) => {
      setInboxCounts(counts);
      onInboxCounts?.(counts);
    },
    [onInboxCounts],
  );

  const allChecked =
    messages.length > 0 && messages.every((m) => checkedIds.has(m.threadId));
  const checkedCount = checkedIds.size;

  const load = useCallback(() => {
    fetch("/api/gmail/messages")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const list: GmailMessage[] = data.messages || [];
        const living = new Set(list.map((m) => m.threadId));
        setMessages(list);
        setCheckedIds((prev) => {
          const next = new Set<string>();
          for (const id of prev) {
            if (living.has(id)) next.add(id);
          }
          return next;
        });
        setSelected((prev) =>
          prev
            ? list.find(
                (m) =>
                  m.threadId === prev.threadId || m.id === prev.id,
              ) || null
            : null,
        );
        if (
          data.inbox &&
          typeof data.inbox.unread === "number" &&
          typeof data.inbox.total === "number"
        ) {
          publishCounts({
            unread: data.inbox.unread,
            total: data.inbox.total,
          });
        }
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [publishCounts]);

  useEffect(() => {
    if (!connected) publishCounts(null);
  }, [connected, publishCounts]);

  useEffect(() => {
    if (!connected) return;
    load();
    const id = setInterval(load, MAIL_REFRESH_MS);
    return () => clearInterval(id);
  }, [connected, load]);

  useEffect(() => {
    if (!connected || !focusRequest) return;

    const match =
      messagesRef.current.find(
        (m) =>
          m.id === focusRequest.messageId ||
          m.threadId === focusRequest.threadId,
      ) || null;

    if (match) {
      setSelected(match);
      setComposeMode(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/gmail/messages/${encodeURIComponent(focusRequest.messageId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const message = data.message as GmailMessageDetail;
        setSelected(message);
        setComposeMode(null);
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [message, ...prev],
        );
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Could not open email");
      });

    return () => {
      cancelled = true;
    };
  }, [connected, focusRequest]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setDetail(null);

    fetch(`/api/gmail/messages/${encodeURIComponent(selected.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setDetail(data.message as GmailMessageDetail);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || "Failed to load message");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

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
    setCheckedIds((prev) => {
      if (!prev.has(msg.threadId) && !prev.has(msg.id)) return prev;
      const next = new Set(prev);
      next.delete(msg.threadId);
      next.delete(msg.id);
      return next;
    });
    const current = inboxCountsRef.current;
    if (current) {
      publishCounts({
        unread: Math.max(0, current.unread - (msg.unread ? 1 : 0)),
        total: Math.max(0, current.total - 1),
      });
    }
    if (
      selected &&
      (selected.threadId === msg.threadId || selected.id === msg.id)
    ) {
      setSelected(null);
      setDetail(null);
      setComposeMode(null);
    }
  };

  const toggleChecked = (threadId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
      return;
    }
    setCheckedIds(new Set(messages.map((m) => m.threadId)));
  };

  const runMailAction = async (
    msg: GmailMessage,
    action: "archive" | "delete" | "accept-invite" | "decline-invite",
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
      const statusByAction: Record<typeof action, string> = {
        "accept-invite": data.demo
          ? "Accepted & added to calendar (demo)"
          : "Accepted & added to calendar",
        "decline-invite": data.demo
          ? "Declined invitation (demo)"
          : "Declined invitation",
        archive: data.demo ? "Archived (demo)" : "Archived",
        delete: data.demo ? "Deleted (demo)" : "Moved to trash",
      };
      setStatus(statusByAction[action]);
    } finally {
      setActing(false);
    }
  };

  const runBulkMailAction = async (action: "archive" | "delete") => {
    const targets = messages.filter((m) => checkedIds.has(m.threadId));
    if (targets.length === 0) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Move ${targets.length} email${targets.length === 1 ? "" : "s"} to trash? You can recover them from Gmail Trash.`,
      )
    ) {
      return;
    }

    setActing(true);
    setError(null);
    let ok = 0;
    let failed = 0;
    try {
      for (const msg of targets) {
        try {
          const res = await fetch(`/api/gmail/messages/${msg.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, threadId: msg.threadId }),
          });
          const data = await res.json();
          if (!res.ok) {
            failed += 1;
            setError(data.error || `${action} failed`);
            continue;
          }
          removeFromList(msg);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) {
        setStatus(
          action === "archive"
            ? `Archived ${ok} email${ok === 1 ? "" : "s"}`
            : `Moved ${ok} email${ok === 1 ? "" : "s"} to trash`,
        );
      }
      if (failed > 0 && ok === 0) {
        setError(`Could not ${action} selected emails`);
      } else if (failed > 0) {
        setError(`${failed} email${failed === 1 ? "" : "s"} failed to ${action}`);
      }
      setCheckedIds(new Set());
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
          {messages.length > 0 && (
            <label className="mail-select-all">
              <input
                type="checkbox"
                checked={allChecked}
                disabled={acting}
                onChange={toggleCheckAll}
                aria-label={allChecked ? "Deselect all emails" : "Select all emails"}
              />
              <span className="muted">
                {checkedCount > 0 ? `${checkedCount} selected` : "Select"}
              </span>
            </label>
          )}
          {checkedCount > 0 && (
            <>
              <button
                type="button"
                className="btn-ghost"
                disabled={acting}
                onClick={() => void runBulkMailAction("archive")}
              >
                Archive selected
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={acting}
                onClick={() => void runBulkMailAction("delete")}
              >
                Delete selected
              </button>
            </>
          )}
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
              <div
                className={[
                  "mail-row",
                  selected?.id === m.id ? "active" : "",
                  m.unread ? "unread" : "",
                  checkedIds.has(m.threadId) ? "checked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <label className="mail-check">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(m.threadId)}
                    disabled={acting}
                    aria-label={`Select ${m.subject}`}
                    onChange={() => toggleChecked(m.threadId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <button
                  type="button"
                  className="mail-item"
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
                  <span className="mail-from">
                    {m.from.split("<")[0].trim()}
                  </span>
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
                  <span className="mail-desc">
                    {briefDescription(m.snippet)}
                  </span>
                </button>
                <div className="mail-row-actions">
                  {m.isInvitation && (
                    <>
                      <button
                        type="button"
                        className="mail-row-accept btn-primary"
                        disabled={acting}
                        aria-label={`Accept invitation ${m.subject}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runMailAction(m, "accept-invite");
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="mail-row-decline btn-ghost"
                        disabled={acting}
                        aria-label={`Decline invitation ${m.subject}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runMailAction(m, "decline-invite");
                        }}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="mail-row-archive btn-ghost"
                    disabled={acting}
                    aria-label={`Archive ${m.subject}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void runMailAction(m, "archive");
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className="mail-row-delete btn-danger"
                    disabled={acting}
                    aria-label={`Delete ${m.subject}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          "Move this email to trash? You can recover it from Gmail Trash.",
                        )
                      ) {
                        void runMailAction(m, "delete");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
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
          <article className="mail-preview">
            <div className="mail-preview-toolbar">
              <div className="compose-actions mail-actions">
                {selected.isInvitation && (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={acting}
                      onClick={() => runMailAction(selected, "accept-invite")}
                    >
                      {acting ? "Working…" : "Accept & add to calendar"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={acting}
                      onClick={() => runMailAction(selected, "decline-invite")}
                    >
                      Decline
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={selected.isInvitation ? "btn-ghost" : "btn-primary"}
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
              </div>
              <div className="compose-actions mail-actions mail-manage-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={acting}
                  onClick={() => runMailAction(selected, "archive")}
                >
                  {acting ? "Working…" : "Archive"}
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
            </div>
            <h3>{(detail || selected).subject}</h3>
            <p className="msg-meta">
              <strong>{(detail || selected).from}</strong>
              <span>
                {formatDistanceToNow(new Date((detail || selected).date), {
                  addSuffix: true,
                })}
              </span>
            </p>
            {((detail || selected).to || (detail || selected).cc) && (
              <p className="mail-recipients muted">
                {(detail || selected).to && (
                  <span>To: {(detail || selected).to}</span>
                )}
                {(detail || selected).cc && (
                  <span>Cc: {(detail || selected).cc}</span>
                )}
              </p>
            )}
            {loadingDetail ? (
              <p className="muted">Loading full message…</p>
            ) : detail?.html ? (
              <iframe
                className="mail-body-frame"
                title="Email body"
                sandbox=""
                srcDoc={emailSrcDoc(detail.html)}
              />
            ) : detail?.text ? (
              <pre className="mail-body-text">{detail.text}</pre>
            ) : (
              <p className="mail-snippet">{selected.snippet}</p>
            )}
          </article>
        ) : (
          <p className="muted">Select a message</p>
        )}
      </div>
    </div>
  );
}
