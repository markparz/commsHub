"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { usePersistedString } from "@/hooks/usePersistedString";

type StatusEntry = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

type StatusResponse = {
  entries?: StatusEntry[];
  error?: string;
  git?: { attempted: boolean; ok: boolean; message: string };
};

function formatWhen(value: string) {
  const parsed = parseISO(value);
  const date = isValid(parsed) ? parsed : new Date(value);
  if (!isValid(date)) return value;
  return `${format(date, "MMM d, h:mma")} · ${formatDistanceToNow(date, {
    addSuffix: true,
  })}`;
}

function friendlyFetchError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return null; // superseded request — ignore
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Could not reach the Status API (server busy or restarting). Try Refresh in a moment.";
  }
  return msg || "Failed to load status";
}

export function StatusPane() {
  const [author, setAuthor] = usePersistedString(
    "comms-hub-status-author",
    "",
  );
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (opts?: { sync?: boolean }) => {
    const sync = opts?.sync !== false;
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setLoading(true);
    try {
      const url = sync ? "/api/status" : "/api/status?sync=0";
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });
      const data = (await res.json()) as StatusResponse;
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to load status");
      }
      setEntries(data.entries || []);
      setError(null);
      if (data.git && data.git.attempted && !data.git.ok) {
        setHint(data.git.message);
      } else if (data.git?.ok && data.git.attempted) {
        setHint(null);
      }
    } catch (err) {
      const friendly = friendlyFetchError(err);
      if (friendly) setError(friendly);
    } finally {
      if (inflight.current === controller) {
        setLoading(false);
        inflight.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void load({ sync: true });
    // Occasional local poll only — Status is not instant messaging
    const id = setInterval(() => void load({ sync: false }), 15 * 60 * 1000);
    return () => {
      clearInterval(id);
      inflight.current?.abort();
    };
  }, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || posting) return;
    setPosting(true);
    setHint(null);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: author.trim() || "anonymous",
          text: text.trim(),
        }),
      });
      const data = (await res.json()) as StatusResponse;
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to post status");
      }
      setEntries(data.entries || []);
      setText("");
      setError(null);
      if (data.git?.attempted) {
        setHint(
          data.git.ok
            ? data.git.message
            : `Saved locally, but git sync failed: ${data.git.message}`,
        );
      }
    } catch (err) {
      const friendly = friendlyFetchError(err);
      setError(friendly || "Failed to post status");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="pane-body status-body">
      <form className="status-compose" onSubmit={onSubmit}>
        <div className="status-compose-row">
          <label className="status-author-label" htmlFor="status-author">
            Name
          </label>
          <input
            id="status-author"
            className="status-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="your name"
            maxLength={60}
            autoComplete="nickname"
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void load({ sync: true })}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <textarea
          className="status-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What are you working on? Blockers? Wins?"
          rows={3}
          maxLength={2000}
          required
        />
        <div className="status-compose-actions">
          <span className="muted status-sync-hint">
            Shared via git · auto-refresh every 15 min · use Refresh to sync now
          </span>
          <button
            type="submit"
            className="btn-primary"
            disabled={posting || !text.trim()}
          >
            {posting ? "Posting…" : "Post status"}
          </button>
        </div>
      </form>

      {error && <p className="error-banner">{error}</p>}
      {hint && !error && <p className="status-hint">{hint}</p>}

      <div className="status-feed">
        {loading && entries.length === 0 ? (
          <p className="muted">Loading status…</p>
        ) : entries.length === 0 ? (
          <p className="muted">No status yet — be the first today.</p>
        ) : (
          <ul className="status-list">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={
                  entry.author.toLowerCase() === "@computer"
                    ? "status-item computer"
                    : "status-item"
                }
              >
                <div className="status-meta">
                  <strong className="status-who">{entry.author}</strong>
                  <time dateTime={entry.createdAt}>
                    {formatWhen(entry.createdAt)}
                  </time>
                </div>
                <p className="status-text">{entry.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
