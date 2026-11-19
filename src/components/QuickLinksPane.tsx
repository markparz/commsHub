"use client";

import { FormEvent, useEffect, useState } from "react";

export type QuickLink = {
  id: string;
  label: string;
  url: string;
};

const STORAGE_KEY = "comms-hub-quick-links";

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  {
    id: "sales-assistant",
    label: "Sales Assistant",
    url: "https://shadowbot.io.redhat.com/agents/sales-assistant",
  },
  {
    id: "marks-dashboard",
    label: "Mark's Dashboard",
    url: "https://app.smartsheet.com/dashboards/34qJppp2hF5h29g6785XjWWgwMX82V5jqRGcrjj1",
  },
];

function loadLinks(): QuickLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_LINKS;
    const parsed = JSON.parse(raw) as QuickLink[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_QUICK_LINKS;
    }
    return parsed.filter(
      (link) =>
        link &&
        typeof link.id === "string" &&
        typeof link.label === "string" &&
        typeof link.url === "string",
    );
  } catch {
    return DEFAULT_QUICK_LINKS;
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
  const [links, setLinks] = useState<QuickLink[]>(DEFAULT_QUICK_LINKS);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLinks(loadLinks());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    } catch {
      /* ignore */
    }
  }, [links, ready]);

  const addLink = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a valid http(s) URL");
      return;
    }
    const name = label.trim() || normalized;
    setLinks((prev) => [
      ...prev,
      {
        id: `link-${Date.now()}`,
        label: name,
        url: normalized,
      },
    ]);
    setLabel("");
    setUrl("");
    setError(null);
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const resetDefaults = () => {
    setLinks(DEFAULT_QUICK_LINKS);
    setError(null);
  };

  return (
    <div className="pane-body quick-links-body">
      <ul className="quick-links-list">
        {links.map((link) => (
          <li key={link.id} className="quick-link-row">
            <a
              className="quick-link"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="quick-link-label">{link.label}</span>
              <span className="quick-link-url muted">{link.url}</span>
            </a>
            <button
              type="button"
              className="btn-ghost quick-link-remove"
              aria-label={`Remove ${link.label}`}
              onClick={() => removeLink(link.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form className="quick-links-form" onSubmit={addLink}>
        <p className="compose-label">Add link</p>
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
        <div className="compose-actions">
          <button type="submit" className="btn-primary">
            Add
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={resetDefaults}
          >
            Reset defaults
          </button>
        </div>
      </form>
    </div>
  );
}
