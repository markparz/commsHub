"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistedString } from "@/hooks/usePersistedString";
import {
  blobToMonoFloat32,
  getLocalTranscriber,
  pickRecorderMimeType,
  transcriptText,
} from "@/lib/local-transcribe";

const CHUNK_MS = 4000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function ScratchPadPane() {
  const [notes, setNotes] = usePersistedString("comms-hub-scratchpad", "");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Saved on this device");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const notesRef = useRef(notes);
  const listeningRef = useRef(false);
  const loopRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  notesRef.current = notes;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const appendTranscript = useCallback(
    (text: string) => {
      const chunk = text.trim();
      if (!chunk) return;
      const current = notesRef.current;
      const needsSpace =
        current.length > 0 &&
        !/\s$/.test(current) &&
        !/^[.,!?;:]/.test(chunk);
      const next = `${current}${needsSpace ? " " : ""}${chunk}`;
      notesRef.current = next;
      setNotes(next);
    },
    [setNotes],
  );

  const releaseMic = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }, []);

  const stopDictation = useCallback(() => {
    listeningRef.current = false;
    loopRef.current += 1;
    setListening(false);
    setStatus("Saved on this device");
    releaseMic();
  }, [releaseMic]);

  const recordChunk = useCallback(
    async (stream: MediaStream, mimeType?: string) => {
      const chunks: BlobPart[] = [];
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error("Recorder failed"));
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
        };
      });

      recorder.start();
      await sleep(CHUNK_MS);
      if (recorder.state !== "inactive") recorder.stop();
      return stopped;
    },
    [],
  );

  const startDictation = useCallback(async () => {
    if (listeningRef.current) return;
    setDictationError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSupported(false);
      setDictationError("Dictation needs microphone access in this browser.");
      return;
    }

    listeningRef.current = true;
    const loopId = loopRef.current + 1;
    loopRef.current = loopId;
    setListening(true);
    setStatus("Requesting microphone…");
    textareaRef.current?.focus();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      if (!listeningRef.current || loopRef.current !== loopId) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;

      setStatus("Loading speech model (first time may take a minute)…");
      const transcriber = await getLocalTranscriber();
      if (!listeningRef.current || loopRef.current !== loopId) {
        releaseMic();
        return;
      }

      const mimeType = pickRecorderMimeType();
      setStatus("Listening… speak now");

      while (listeningRef.current && loopRef.current === loopId) {
        let blob: Blob;
        try {
          blob = await recordChunk(stream, mimeType);
        } catch {
          if (listeningRef.current && loopRef.current === loopId) {
            setDictationError("Could not capture audio from the microphone.");
            stopDictation();
          }
          return;
        }

        if (!listeningRef.current || loopRef.current !== loopId) return;
        if (blob.size < 800) continue;

        setStatus("Transcribing…");
        try {
          const audio = await blobToMonoFloat32(blob);
          const result = await transcriber(audio);
          const text = transcriptText(result);
          if (text) appendTranscript(text);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Transcription failed";
          // Keep listening; surface a soft error but don't hard-stop on one bad chunk.
          setDictationError(message);
        }
        if (listeningRef.current && loopRef.current === loopId) {
          setStatus("Listening…");
        }
      }
    } catch (err) {
      listeningRef.current = false;
      setListening(false);
      releaseMic();
      setStatus("Saved on this device");
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setDictationError(
          "Microphone permission denied. Allow mic access for this site, then try again.",
        );
      } else {
        setDictationError(
          err instanceof Error
            ? err.message
            : "Could not start dictation. Check microphone access and network for the speech model.",
        );
      }
    }
  }, [appendTranscript, recordChunk, releaseMic, stopDictation]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      loopRef.current += 1;
      releaseMic();
    };
  }, [releaseMic]);

  return (
    <div className="pane-body scratch-body">
      <div className="pane-toolbar">
        <button
          type="button"
          className="btn-ghost"
          disabled={!notes || listening}
          onClick={() => setNotes("")}
        >
          Clear
        </button>
        {supported ? (
          <button
            type="button"
            className={listening ? "btn-primary scratch-dictate-active" : "btn-ghost"}
            onClick={() => (listening ? stopDictation() : void startDictation())}
            title={
              listening
                ? "Stop listening"
                : "Dictate with your laptop microphone"
            }
          >
            {listening ? "Stop dictation" : "Dictate"}
          </button>
        ) : null}
        <span className="muted scratch-hint">{status}</span>
      </div>
      {dictationError && <p className="error-line">{dictationError}</p>}
      <textarea
        ref={textareaRef}
        className="scratch-editor"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Scratch notes, draft replies, reminders… Use Dictate to speak into your mic."
        spellCheck
      />
    </div>
  );
}
