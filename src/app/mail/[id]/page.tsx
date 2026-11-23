"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { emailSrcDoc } from "@/lib/email";
import type { GmailMessageDetail } from "@/lib/types";

function parseMailDate(value: string): Date {
  const parsed = new Date(value);
  if (isValid(parsed)) return parsed;
  const iso = parseISO(value);
  return isValid(iso) ? iso : new Date();
}

export default function MailWindowPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [message, setMessage] = useState<GmailMessageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError("Missing message id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/gmail/messages/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const msg = data.message as GmailMessageDetail;
        setMessage(msg);
        if (msg.subject) document.title = msg.subject;
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load email");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="mail-window">
      <header className="mail-window-bar">
        <p className="mail-window-brand">Comms Hub</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => window.close()}
        >
          Close
        </button>
      </header>

      {loading && <p className="muted mail-window-status">Loading email…</p>}
      {error && <p className="error-line mail-window-status">{error}</p>}

      {message && (
        <article className="mail-window-body">
          <h1>{message.subject || "(no subject)"}</h1>
          <p className="msg-meta">
            <strong>{message.from}</strong>
            <span>
              {format(parseMailDate(message.date), "MMM d, yyyy · h:mma")}
              {" · "}
              {formatDistanceToNow(parseMailDate(message.date), {
                addSuffix: true,
              })}
            </span>
          </p>
          {(message.to || message.cc) && (
            <p className="mail-recipients muted">
              {message.to && <span>To: {message.to}</span>}
              {message.cc && <span>Cc: {message.cc}</span>}
            </p>
          )}
          {message.html ? (
            <iframe
              className="mail-window-frame"
              title="Email body"
              sandbox=""
              srcDoc={emailSrcDoc(message.html)}
            />
          ) : message.text ? (
            <pre className="mail-body-text">{message.text}</pre>
          ) : (
            <p className="mail-snippet">{message.snippet}</p>
          )}
        </article>
      )}
    </main>
  );
}
