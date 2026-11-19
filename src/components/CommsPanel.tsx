"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { AuthStatus, CalendarEvent } from "@/lib/types";
import { useMeetingAlerts } from "@/hooks/useMeetingAlerts";
import { usePersistedNumber } from "@/hooks/usePersistedNumber";
import { MeetingBanner } from "./MeetingBanner";
import { SlackPane } from "./SlackPane";
import { GmailPane } from "./GmailPane";
import { CalendarPane } from "./CalendarPane";
import { StatusPane } from "./StatusPane";
import { QuickLinksPane } from "./QuickLinksPane";
import { ResizeHandle } from "./ResizeHandle";

type Tab = "slack" | "calendar" | "gmail" | "status" | "links";

const MIN_PAIR = 28;
const MAX_PAIR = 72;
const MIN_LEFT = 35;
const MAX_LEFT = 75;
const MIN_ROW = 28;
const MAX_ROW = 72;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function CommsPanel() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mobileTab, setMobileTab] = useState<Tab>("slack");
  const onEvents = useCallback((list: CalendarEvent[]) => setEvents(list), []);

  const stackRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const topLeftRef = useRef<HTMLElement>(null);
  const bottomLeftRef = useRef<HTMLElement>(null);

  const [leftPct, setLeftPct] = usePersistedNumber("comms-hub-col-left", 58);
  const [slackPct, setSlackPct] = usePersistedNumber(
    "comms-hub-col-slack-pair",
    50,
  );
  const [statusPct, setStatusPct] = usePersistedNumber(
    "comms-hub-col-status",
    50,
  );
  const [leftTopPct, setLeftTopPct] = usePersistedNumber(
    "comms-hub-row-left-top",
    55,
  );

  const calendarPct = Math.max(MIN_PAIR, 100 - slackPct);
  const linksPct = Math.max(MIN_PAIR, 100 - statusPct);
  const gmailPct = Math.max(100 - MAX_LEFT, 100 - leftPct);

  const googleOn = Boolean(status?.google);
  const { permission, requestPermission, alerts, dismiss } = useMeetingAlerts(
    events,
    googleOn,
  );

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ google: false, slack: false, demo: true }));
  }, []);

  const dragLeftGmail = useCallback(
    (deltaPx: number) => {
      const width = stackRef.current?.clientWidth || 1;
      const deltaPct = (deltaPx / width) * 100;
      setLeftPct((prev) => clamp(prev + deltaPct, MIN_LEFT, MAX_LEFT));
    },
    [setLeftPct],
  );

  const dragSlackCalendar = useCallback(
    (deltaPx: number) => {
      const width = topLeftRef.current?.clientWidth || 1;
      const deltaPct = (deltaPx / width) * 100;
      setSlackPct((prev) => clamp(prev + deltaPct, MIN_PAIR, MAX_PAIR));
    },
    [setSlackPct],
  );

  const dragStatusLinks = useCallback(
    (deltaPx: number) => {
      const width = bottomLeftRef.current?.clientWidth || 1;
      const deltaPct = (deltaPx / width) * 100;
      setStatusPct((prev) => clamp(prev + deltaPct, MIN_PAIR, MAX_PAIR));
    },
    [setStatusPct],
  );

  const dragLeftRows = useCallback(
    (deltaPx: number) => {
      const height = leftRef.current?.clientHeight || 1;
      const deltaPct = (deltaPx / height) * 100;
      setLeftTopPct((prev) => clamp(prev + deltaPct, MIN_ROW, MAX_ROW));
    },
    [setLeftTopPct],
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand">Comms Hub</p>
          <p className="tagline">
            Slack, Calendar, Gmail, Status &amp; Quick Links
          </p>
        </div>
        <div className="top-actions">
          {status?.demo && <span className="pill">Demo mode</span>}
          {!status?.slack && (
            <a className="btn-ghost" href="/api/auth/slack">
              Connect Slack
            </a>
          )}
          {!status?.google && (
            <a className="btn-ghost" href="/api/auth/google">
              Connect Google
            </a>
          )}
          {(status?.slack || status?.google) && !status?.demo && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                fetch("/api/auth/logout", { method: "POST" }).then(() =>
                  window.location.reload(),
                )
              }
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      <MeetingBanner
        alerts={alerts}
        permission={permission}
        onEnable={requestPermission}
        onDismiss={dismiss}
      />

      <nav className="mobile-tabs" aria-label="Panels">
        {(
          [
            ["slack", "Slack"],
            ["calendar", "Calendar"],
            ["gmail", "Gmail"],
            ["status", "Status"],
            ["links", "Links"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mobileTab === id ? "tab active" : "tab"}
            onClick={() => setMobileTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        className="workspace-stack"
        ref={stackRef}
        style={
          {
            "--col-left": `${leftPct}%`,
            "--col-gmail": `${gmailPct}%`,
          } as CSSProperties
        }
      >
        <div
          className="workspace-left"
          ref={leftRef}
          style={
            {
              "--row-left-top": `${leftTopPct}%`,
            } as CSSProperties
          }
        >
          <main
            className="workspace workspace-left-top"
            ref={topLeftRef}
            style={
              {
                "--col-slack": `${slackPct}%`,
                "--col-calendar": `${calendarPct}%`,
              } as CSSProperties
            }
          >
            <section
              className={
                mobileTab === "slack"
                  ? "pane pane-slack show"
                  : "pane pane-slack"
              }
            >
              <header className="pane-head">
                <h2>Slack</h2>
                <span className={status?.slack ? "dot on" : "dot"} />
              </header>
              <SlackPane connected={Boolean(status?.slack)} />
            </section>

            <ResizeHandle
              orientation="vertical"
              label="Resize Slack and Calendar"
              onDrag={dragSlackCalendar}
            />

            <section
              className={
                mobileTab === "calendar"
                  ? "pane pane-calendar show"
                  : "pane pane-calendar"
              }
            >
              <header className="pane-head">
                <h2>Calendar</h2>
                <span className={status?.google ? "dot on" : "dot"} />
              </header>
              <CalendarPane
                connected={Boolean(status?.google)}
                onEvents={onEvents}
              />
            </section>
          </main>

          <ResizeHandle
            orientation="horizontal"
            label="Resize upper and lower left panels"
            onDrag={dragLeftRows}
          />

          <main
            className="workspace workspace-left-bottom"
            ref={bottomLeftRef}
            style={
              {
                "--col-status": `${statusPct}%`,
                "--col-links": `${linksPct}%`,
              } as CSSProperties
            }
          >
            <section
              className={
                mobileTab === "status"
                  ? "pane pane-status show"
                  : "pane pane-status"
              }
            >
              <header className="pane-head">
                <h2>Status</h2>
                <span className="dot on" />
              </header>
              <StatusPane />
            </section>

            <ResizeHandle
              orientation="vertical"
              label="Resize Status and Quick Links"
              onDrag={dragStatusLinks}
            />

            <section
              className={
                mobileTab === "links"
                  ? "pane pane-links show"
                  : "pane pane-links"
              }
            >
              <header className="pane-head">
                <h2>Quick links</h2>
                <span className="dot on" />
              </header>
              <QuickLinksPane />
            </section>
          </main>
        </div>

        <ResizeHandle
          orientation="vertical"
          label="Resize left panels and Gmail"
          onDrag={dragLeftGmail}
        />

        <section
          className={
            mobileTab === "gmail" ? "pane pane-gmail show" : "pane pane-gmail"
          }
        >
          <header className="pane-head">
            <h2>Gmail</h2>
            <span className={status?.google ? "dot on" : "dot"} />
          </header>
          <GmailPane connected={Boolean(status?.google)} />
        </section>
      </div>
    </div>
  );
}
