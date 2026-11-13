"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { SlackChannel, SlackMessage } from "@/lib/types";

export function SlackPane({ connected }: { connected: boolean }) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/slack/channels")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChannels(data.channels || []);
        if (data.channels?.[0]) setChannelId(data.channels[0].id);
      })
      .catch((e) => setError(e.message));
  }, [connected]);

  useEffect(() => {
    if (!connected || !channelId) return;
    setLoading(true);
    fetch(`/api/slack/messages?channel=${channelId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMessages(data.messages || []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [connected, channelId]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !channelId) return;
    const optimistic = text;
    setText("");
    const res = await fetch("/api/slack/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, text: optimistic }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Send failed");
      setText(optimistic);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        user: "You",
        text: optimistic,
        ts: new Date().toISOString(),
        channelId,
      },
    ]);
  };

  if (!connected) {
    return (
      <div className="pane-empty">
        <p>Connect Slack to read channels and send messages.</p>
        <a className="btn-primary" href="/api/auth/slack">
          Connect Slack
        </a>
      </div>
    );
  }

  return (
    <div className="pane-body">
      <div className="channel-rail">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            className={channelId === c.id ? "channel active" : "channel"}
            onClick={() => setChannelId(c.id)}
          >
            #{c.name}
          </button>
        ))}
      </div>
      <div className="thread">
        {error && <p className="error-line">{error}</p>}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="msg-list">
            {messages.map((m) => (
              <li key={m.id}>
                <div className="msg-meta">
                  <strong>{m.user}</strong>
                  <span>
                    {formatDistanceToNow(new Date(m.ts), { addSuffix: true })}
                  </span>
                </div>
                <p>{m.text}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="composer" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message channel…"
            aria-label="Slack message"
          />
          <button type="submit" className="btn-primary" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
