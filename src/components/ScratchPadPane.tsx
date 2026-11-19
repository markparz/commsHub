"use client";

import { usePersistedString } from "@/hooks/usePersistedString";

export function ScratchPadPane() {
  const [notes, setNotes] = usePersistedString("comms-hub-scratchpad", "");

  return (
    <div className="pane-body scratch-body">
      <div className="pane-toolbar">
        <button
          type="button"
          className="btn-ghost"
          disabled={!notes}
          onClick={() => setNotes("")}
        >
          Clear
        </button>
        <span className="muted scratch-hint">Saved on this device</span>
      </div>
      <textarea
        className="scratch-editor"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Scratch notes, draft replies, reminders…"
        spellCheck
      />
    </div>
  );
}
