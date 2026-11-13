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
import { ResizeHandle } from "./ResizeHandle";

type Tab = "slack" | "calendar" | "gmail";

const MIN_COL = 18;
const MAX_COL = 55;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function CommsPanel() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mobileTab, setMobileTab] = useState<Tab>("slack");
  const onEvents = useCallback((list: CalendarEvent[]) => setEvents(list), []);
  const workspaceRef = useRef<HTMLElement>(null);

  const [slackPct, setSlackPct] = usePersistedNumber("comms-hub-col-slack", 34);
  const [calendarPct, setCalendarPct] = usePersistedNumber(
    "comms-hub-col-calendar",
    33,
  );
  const colsRef = useRef({ slack: slackPct, calendar: calendarPct });
  colsRef.current = { slack: slackPct, calendar: calendarPct };

  const gmailPct = Math.max(MIN_COL, 100 - slackPct - calendarPct);

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

  const dragSlackCalendar = useCallback(
    (deltaPx: number) => {
      const width = workspaceRef.current?.clientWidth || 1;
      const deltaPct = (deltaPx / width) * 100;
      const { slack, calendar } = colsRef.current;
      let nextSlack = clamp(slack + deltaPct, MIN_COL, MAX_COL);
      let nextCal = clamp(calendar - (nextSlack - slack), MIN_COL, MAX_COL);
      if (100 - nextSlack - nextCal < MIN_COL) {
        nextCal = clamp(100 - MIN_COL - nextSlack, MIN_COL, MAX_COL);
        nextSlack = clamp(100 - MIN_COL - nextCal, MIN_COL, MAX_COL);
      }
      setSlackPct(nextSlack);
      setCalendarPct(nextCal);
    },
    [setCalendarPct, setSlackPct],
  );

  const dragCalendarGmail = useCallback(
    (deltaPx: number) => {
      const width = workspaceRef.current?.clientWidth || 1;
      const deltaPct = (deltaPx / width) * 100;
      const { slack, calendar } = colsRef.current;
      let nextCal = clamp(calendar + deltaPct, MIN_COL, MAX_COL);
      const nextGmail = 100 - slack - nextCal;
      if (nextGmail < MIN_COL) {
        nextCal = clamp(100 - slack - MIN_COL, MIN_COL, MAX_COL);
      } else if (nextGmail > MAX_COL) {
        nextCal = clamp(100 - slack - MAX_COL, MIN_COL, MAX_COL);
      }
      setCalendarPct(nextCal);
    },
    [setCalendarPct],
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand">Comms Hub</p>
          <p className="tagline">Slack, Calendar &amp; Gmail — one workspace</p>
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

      <main
        className="workspace"
        ref={workspaceRef}
        style={
          {
            "--col-slack": `${slackPct}%`,
            "--col-calendar": `${calendarPct}%`,
            "--col-gmail": `${gmailPct}%`,
          } as CSSProperties
        }
      >
        <section
          className={
            mobileTab === "slack" ? "pane pane-slack show" : "pane pane-slack"
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

        <ResizeHandle
          orientation="vertical"
          label="Resize Calendar and Gmail"
          onDrag={dragCalendarGmail}
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
      </main>
    </div>
  );
}
