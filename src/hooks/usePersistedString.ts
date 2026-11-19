"use client";

import { useEffect, useState } from "react";

export function usePersistedString(key: string, fallback = "") {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(raw);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }, [key, value, ready]);

  return [value, setValue] as const;
}
