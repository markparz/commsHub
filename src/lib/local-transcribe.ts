/** Browser-only Whisper helper (loaded on demand). */

type Transcriber = (audio: Float32Array | string) => Promise<{ text?: string } | string>;

let transcriberPromise: Promise<Transcriber> | null = null;

export async function getLocalTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Cache models in IndexedDB; fetch from Hugging Face / mirrors.
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      // English-only model — do not pass language/task (those are multilingual-only).
      const pipe = await pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-tiny.en",
        { dtype: "q8" },
      );
      return async (audio: Float32Array | string) => {
        const result = await pipe(audio);
        return result as { text?: string } | string;
      };
    })().catch((err) => {
      transcriberPromise = null;
      throw err;
    });
  }
  return transcriberPromise;
}

export function transcriptText(result: { text?: string } | string): string {
  if (typeof result === "string") return result.trim();
  return (result.text || "").trim();
}

function mixToMono(decoded: AudioBuffer): Float32Array {
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);
  const len = decoded.length;
  const mixed = new Float32Array(len);
  for (let c = 0; c < decoded.numberOfChannels; c += 1) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < len; i += 1) mixed[i] += ch[i] / decoded.numberOfChannels;
  }
  return mixed;
}

/** Linear resample to 16 kHz (Whisper input rate). */
function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

/** Decode a recorded audio Blob to mono Float32Array @ 16 kHz for Whisper. */
export async function blobToMonoFloat32(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    return resampleTo16k(mixToMono(decoded), decoded.sampleRate);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}
