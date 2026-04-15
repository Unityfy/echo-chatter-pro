// Voice ID mapping for ElevenLabs
export const VOICE_MAP: Record<string, string> = {
  "Nova": "EXAVITQu4vr4xnSDxMaL",    // Sarah
  "Onyx": "JBFqnCBsd6RMkjVDRZzb",    // George
  "Shimmer": "pFZP5JQG7iQjIQuC4Bku",  // Lily
  "Echo": "cjVigY5qzO86Huf0OWal",     // Eric
  "Alloy": "Xb7hH8MSUJpSbSDYk0k2",   // Alice
  "Fable": "onwK4e9ZLuTAKqWW03F9",    // Daniel
  "Neha": "8baRIHZEGj62eS9YHzC6",
  "Roopa": "8i52rsySWGYoU4SRQCex",
  "Sumeet": "X2jQeFZFwKyCkPx2OHSL",
  "Ankush": "7c9GbBg3PCOqyDlCoB3z",
};

export type RAGDebugInfo = {
  detected_intent: string | null;
  intent_priority: string | null;
  chunks: { source: string; origin: "agent" | "intent"; similarity: number; preview: string }[];
  settings: { chunksToRetrieve: number; similarityThreshold: number };
} | null;

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-tts`;
const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-stt`;

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

/**
 * Stream LLM chat completion with the agent's system prompt.
 */
export async function streamAgentChat({
  messages,
  systemPrompt,
  agentId,
  onDelta,
  onDone,
  onDebug,
  signal,
}: {
  messages: Msg[];
  systemPrompt: string;
  agentId?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onDebug?: (debug: RAGDebugInfo) => void;
  signal?: AbortSignal;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ messages, systemPrompt, agentId }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `Chat failed: ${resp.status}`);
  }

  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

/**
 * Generate speech from text using ElevenLabs TTS.
 */
export async function generateSpeech(text: string, voiceName?: string): Promise<HTMLAudioElement> {
  const voiceId = voiceName ? VOICE_MAP[voiceName] : undefined;

  const response = await fetch(TTS_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  return audio;
}

/**
 * Transcribe audio using ElevenLabs STT.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(STT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: "STT failed" }));
    throw new Error(errData.error || `STT failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text || "";
}
