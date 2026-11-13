"use client";

import type { MeetingAlert } from "@/hooks/useMeetingAlerts";

type Props = {
  alerts: MeetingAlert[];
  permission: NotificationPermission;
  onEnable: () => void;
  onDismiss: (id: string) => void;
};

export function MeetingBanner({
  alerts,
  permission,
  onEnable,
  onDismiss,
}: Props) {
  return (
    <div className="banner-stack">
      {permission !== "granted" && (
        <div className="banner banner-soft">
          <span>
            Enable alerts for a desktop banner and sound{" "}
            <strong>1 minute</strong> before each meeting.
          </span>
          <button type="button" className="btn-ghost" onClick={onEnable}>
            Enable alerts
          </button>
        </div>
      )}
      {alerts.map((alert) => (
        <div key={alert.id} className="banner banner-alert" role="alert">
          <div>
            <p className="banner-kicker">Starting in ~1 minute</p>
            <p className="banner-title">{alert.title}</p>
          </div>
          <div className="banner-actions">
            {alert.meetLink && (
              <a
                className="btn-primary"
                href={alert.meetLink}
                target="_blank"
                rel="noreferrer"
              >
                Join
              </a>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onDismiss(alert.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
