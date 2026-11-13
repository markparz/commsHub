"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";

const ALERT_LEAD_MS = 60_000;
const POLL_MS = 20_000;
const ALERT_SOUND = "/sounds/meeting_alert.m4a";

export type MeetingAlert = {
  id: string;
  title: string;
  start: string;
  meetLink?: string;
  firedAt: number;
};

function playMeetingSound(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Autoplay may be blocked until the user enables alerts */
    });
  } catch {
    /* ignore */
  }
}

export function useMeetingAlerts(events: CalendarEvent[], enabled: boolean) {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [alerts, setAlerts] = useState<MeetingAlert[]>([]);
  const notified = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    const audio = new Audio(ALERT_SOUND);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };

    const fire = (event: CalendarEvent) => {
      if (notified.current.has(event.id)) return;
      notified.current.add(event.id);

      const alert: MeetingAlert = {
        id: event.id,
        title: event.title,
        start: event.start,
        meetLink: event.meetLink,
        firedAt: Date.now(),
      };
      setAlerts((prev) => [alert, ...prev].slice(0, 5));
      playMeetingSound(audioRef.current);

      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const n = new Notification(`Meeting in 1 minute: ${event.title}`, {
            body: event.location || event.meetLink || "Starting soon",
            tag: `meeting-${event.id}`,
          });
          n.onclick = () => {
            window.focus();
            if (event.meetLink) window.open(event.meetLink, "_blank");
          };
        }
      }
    };

    const schedule = () => {
      clearTimers();
      const now = Date.now();

      for (const event of events) {
        const start = new Date(event.start).getTime();
        if (Number.isNaN(start)) continue;
        const fireAt = start - ALERT_LEAD_MS;
        const delay = fireAt - now;

        if (delay <= 0 && start - now > -30_000) {
          fire(event);
          continue;
        }
        if (delay <= 0 || delay > 1000 * 60 * 60 * 12) continue;

        const timer = setTimeout(() => fire(event), delay);
        timers.current.set(event.id, timer);
      }
    };

    schedule();
    const poll = setInterval(schedule, POLL_MS);
    return () => {
      clearTimers();
      clearInterval(poll);
    };
  }, [events, enabled]);

  const requestPermission = async () => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
    // Unlock audio for later alerts after a user gesture
    const audio = audioRef.current;
    if (audio) {
      audio.muted = true;
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      audio.muted = false;
    }
  };

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return { permission, requestPermission, alerts, dismiss };
}
