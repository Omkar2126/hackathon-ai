export type WhisperResult = {
  text: string;
  engine: "whisper" | "whisper-live";
  model: string;
};

export async function transcribeWithWhisper(input: {
  audio?: Blob | Buffer | Uint8Array | ArrayBuffer;
  filename?: string;
  mimeType?: string;
  fallbackText?: string;
}): Promise<WhisperResult> {
  const fallback = input.fallbackText?.trim() ?? "";
  const apiKey =
    process.env.FIREWORKS_API_KEY ||
    process.env.FIREWORKS_AI_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (apiKey && input.audio) {
    try {
      const remote = await callWhisper(apiKey, input);
      if (remote?.text) return remote;
    } catch {
      // Use the live caption if the audio endpoint is unavailable.
    }
  }

  if (fallback) {
    return { text: fallback, engine: "whisper-live", model: "whisper-tiny.en" };
  }

  return { text: "", engine: "whisper-live", model: "whisper-tiny.en" };
}

async function callWhisper(
  apiKey: string,
  input: {
    audio?: Blob | Buffer | Uint8Array | ArrayBuffer;
    filename?: string;
    mimeType?: string;
  },
): Promise<WhisperResult | null> {
  if (!input.audio) return null;
  const bytes = await toUint8(input.audio);
  const filename = input.filename || "speech.webm";
  const mimeType = input.mimeType || "audio/webm";
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const file = new File([copy], filename, { type: mimeType });

  if (process.env.OPENAI_API_KEY && apiKey === process.env.OPENAI_API_KEY) {
    const form = new FormData();
    form.set("model", "whisper-1");
    form.set("file", file);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { text?: string };
    return { text: data.text?.trim() ?? "", engine: "whisper", model: "whisper-1" };
  }

  const form = new FormData();
  form.set("model", process.env.FIREWORKS_WHISPER_MODEL || "whisper-v3");
  form.set("file", file);
  const response = await fetch("https://audio-prod.api.fireworks.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { text?: string };
  return {
    text: data.text?.trim() ?? "",
    engine: "whisper",
    model: process.env.FIREWORKS_WHISPER_MODEL || "whisper-v3",
  };
}

async function toUint8(audio: Blob | Buffer | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (audio instanceof Uint8Array) return audio;
  if (audio instanceof ArrayBuffer) return new Uint8Array(audio);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(audio)) {
    return new Uint8Array(audio);
  }
  const ab = await (audio as Blob).arrayBuffer();
  return new Uint8Array(ab);
}
