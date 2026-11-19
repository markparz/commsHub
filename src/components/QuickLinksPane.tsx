"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePersistedString } from "@/hooks/usePersistedString";

export type QuickLink = {
  id: string;
  label: string;
  url: string;
  addedBy?: string;
  scope: "personal" | "global";
};

/** Per-browser only — never shared via git. */
const STORAGE_KEY = "comms-hub-quick-links-personal";

type Scope = "personal" | "global";

function loadPersonalLinks(): QuickLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Omit<QuickLink, "scope">[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (link) =>
          link &&
          typeof link.id === "string" &&
          typeof link.label === "string" &&
          typeof link.url === "string",
      )
      .map((link) => ({ ...link, scope: "personal" as const }));
  } catch {
    return [];
  }
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function QuickLinksPane() {
  const [author] = usePersistedString("comms-hub-status-author", "");
  const [personal, setPersonal] = useState<QuickLink[]>([]);
  const [globalLinks, setGlobalLinks] = useState<QuickLink[]>([]);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<Scope>("personal");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGlobal = useCallback(async (sync = true) => {
    const res = await fetch(
      sync ? "/api/quick-links" : "/api/quick-links?sync=0",
      { cache: "no-store" },
    );
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to load shared links");
    }
    const links: QuickLink[] = (data.links || []).map(
      (link: {
        id: string;
        label: string;
        url: string;
        addedBy?: string;
      }) => ({
        ...link,
        scope: "global" as const,
      }),
    );
    setGlobalLinks(links);
    if (data.git?.attempted && !data.git.ok) {
      setHint(data.git.message);
    }
  }, []);

  useEffect(() => {
    setPersonal(loadPersonalLinks());
    setReady(true);
    void loadGlobal(true).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load links"),
    );
  }, [loadGlobal]);

  useEffect(() => {
    if (!ready) return;
    try {
      const toStore = personal.map(({ scope: _s, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      /* ignore */
    }
  }, [personal, ready]);

  const addLink = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a valid http(s) URL");
      return;
    }
    const name = label.trim() || normalized;
    setError(null);
    setHint(null);

    if (scope === "personal") {
      setPersonal((prev) => [
        ...prev,
        {
          id: `link-${Date.now()}`,
          label: name,
          url: normalized,
          scope: "personal",
        },
      ]);
      setLabel("");
      setUrl("");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/quick-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: name,
          url: normalized,
          addedBy: author.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to share link");
      }
      setGlobalLinks(
        (data.links || []).map(
          (link: {
            id: string;
            label: string;
            url: string;
            addedBy?: string;
          }) => ({ ...link, scope: "global" as const }),
        ),
      );
      setLabel("");
      setUrl("");
      if (data.git?.attempted) {
        setHint(
          data.git.ok
            ? data.git.message
            : `Saved locally, but git sync failed: ${data.git.message}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share link");
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (link: QuickLink) => {
    setError(null);
    setHint(null);
    if (link.scope === "personal") {
      setPersonal((prev) => prev.filter((item) => item.id !== link.id));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/quick-links?id=${encodeURIComponent(link.id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to remove shared link");
      }
      setGlobalLinks(
        (data.links || []).map(
          (item: {
            id: string;
            label: string;
            url: string;
            addedBy?: string;
          }) => ({ ...item, scope: "global" as const }),
        ),
      );
      if (data.git?.attempted) {
        setHint(
          data.git.ok
            ? data.git.message
            : `Updated locally, but git sync failed: ${data.git.message}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove link");
    } finally {
      setBusy(false);
    }
  };

  const clearPersonal = () => {
    setPersonal([]);
    setError(null);
  };

  const renderList = (items: QuickLink[], empty: string) =>
    items.length === 0 ? (
      <p className="muted quick-links-empty">{empty}</p>
    ) : (
      <ul className="quick-links-list">
        {items.map((link) => (
          <li key={`${link.scope}-${link.id}`} className="quick-link-row">
            <a
              className="quick-link"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="quick-link-label">
                {link.label}
                <span
                  className={
                    link.scope === "global"
                      ? "quick-link-badge global"
                      : "quick-link-badge personal"
                  }
                >
                  {link.scope === "global" ? "Shared" : "Personal"}
                </span>
              </span>
              <span className="quick-link-url muted">{link.url}</span>
              {link.scope === "global" && link.addedBy ? (
                <span className="quick-link-meta muted">
                  added by {link.addedBy}
                </span>
              ) : null}
            </a>
            <button
              type="button"
              className="btn-ghost quick-link-remove"
              aria-label={`Remove ${link.label}`}
              disabled={busy}
              onClick={() => void removeLink(link)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="pane-body quick-links-body">
      <div className="pane-toolbar">
        <span className="muted scratch-hint">
          Personal stays on this device · Shared syncs via git
        </span>
        <button
          type="button"
          className="btn-ghost"
          disabled={personal.length === 0}
          onClick={clearPersonal}
        >
          Clear personal
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() =>
            void loadGlobal(true).catch((err) =>
              setError(
                err instanceof Error ? err.message : "Failed to refresh",
              ),
            )
          }
        >
          Refresh shared
        </button>
      </div>

      <p className="compose-label quick-links-section">Shared with team</p>
      {renderList(globalLinks, "No shared links yet.")}

      <p className="compose-label quick-links-section">Personal (this device)</p>
      {renderList(personal, "No personal links yet.")}

      <form className="quick-links-form" onSubmit={(e) => void addLink(e)}>
        <p className="compose-label">Add link</p>
        <div className="quick-link-scope" role="group" aria-label="Link scope">
          <label className={scope === "personal" ? "active" : undefined}>
            <input
              type="radio"
              name="link-scope"
              checked={scope === "personal"}
              onChange={() => setScope("personal")}
            />
            Personal
          </label>
          <label className={scope === "global" ? "active" : undefined}>
            <input
              type="radio"
              name="link-scope"
              checked={scope === "global"}
              onChange={() => setScope("global")}
            />
            Share globally
          </label>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          required
        />
        {error && <p className="error-line">{error}</p>}
        {hint && !error && <p className="status-hint">{hint}</p>}
        <div className="compose-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy
              ? "Saving…"
              : scope === "global"
                ? "Add shared link"
                : "Add personal link"}
          </button>
        </div>
      </form>
    </div>
  );
}
