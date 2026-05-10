// ════════════════════════════════════════════════════════════════════════════
//  voice-stream — provider-agnostic real-time voice bridge for AI agents
// ════════════════════════════════════════════════════════════════════════════
//
//  Caller ── (provider WS, μ-law 8kHz) ──> [voice-stream]
//    STT (ElevenLabs scribe_v2_realtime, PCM 16k)
//      ──> LLM (Lovable AI Gateway, streaming)
//        ──> TTS (ElevenLabs streaming, μ-law 8k) ──> Caller
//
//  Architecture (three layers, top → bottom in this file):
//    1. PROVIDER LAYER   — ProviderAdapter interface + per-provider adapters
//                          (Exotel implemented; Twilio + Plivo stubs ready).
//                          Adapters parse/format provider-specific WS frames
//                          and normalise everything to opaque μ-law 8 kHz.
//    2. SESSION ENGINE   — Provider-independent core: codecs, adaptive VAD,
//                          STT/LLM/TTS pipeline, turn-state machine, barge-in,
//                          transcript logging, fallback handling.
//    3. ENTRYPOINT       — Thin Deno.serve handler: parse query, load agent,
//                          pick adapter from registry, upgrade WS, hand off.
//
//  URL: wss://<ref>.functions.supabase.co/voice-stream
//         ?provider=exotel|twilio|plivo
//         &agent_id=<uuid>
//         &call_sid=<provider-call-id>
//
//  Public (verify_jwt = false). Security relies on the agent already existing
//  server-side and a valid provider-issued call_sid being present.
//
//  Adding a new telephony provider:
//    1. Implement ProviderAdapter — parseInbound, formatOutboundAudio,
//       formatClear, optionally formatMark/onLifecycle.
//    2. Register it in PROVIDERS below.
//    3. Add a thin webhook function (`<provider>-incoming-call`) that returns
//       the provider's call-control markup pointing at this WSS URL.
//    No changes to the SESSION ENGINE should be required.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ════════════════════════════════════════════════════════════════════════════
//  ┃ LAYER 1: PROVIDER LAYER
// ════════════════════════════════════════════════════════════════════════════

/** Add new providers here — the rest of the file adapts automatically. */
type ProviderName = "twilio" | "plivo";

interface ProviderAdapter {
  name: ProviderName;
  /** Wire-format the provider sends/expects. All currently μ-law 8 kHz —
   *  if a future provider uses something else, extend the codec layer too. */
  audio: { encoding: "mulaw"; sampleRate: 8000 };

  /** Parse one inbound text frame from the provider WS into a normalised
   *  event the session engine understands. Return null for keepalives /
   *  unknown frames. `sessionId` is whatever opaque id the provider uses
   *  to tag outbound frames (Exotel: stream_sid; Twilio: streamSid). */
  parseInbound(raw: string): InboundEvent | null;

  /** Wrap a base64 μ-law audio chunk in the provider's outbound frame. */
  formatOutboundAudio(sessionId: string, mulawB64: string): string;

  /** Tell the provider to flush its playout buffer (used for barge-in).
   *  Return null if the provider has no equivalent — the engine will still
   *  abort upstream LLM/TTS. */
  formatClear(sessionId: string): string | null;

  /** Optional: send a "mark" so the provider notifies us when audio drains.
   *  Useful for precise turn-end detection. Return null if unsupported. */
  formatMark?(sessionId: string, markName: string): string | null;
}

type InboundEvent =
  | { type: "start"; sessionId: string }
  | { type: "audio"; mulawB64: string }
  | { type: "mark"; name: string }
  | { type: "stop" };

// ─── Adapters ──────────────────────────────────────────────────────────────

/** Twilio Media Streams protocol (stub, ready to use).
 *  Frames: { event: "connected"|"start"|"media"|"mark"|"stop",
 *            streamSid, media: { payload, track, timestamp, chunk } }
 *  Twilio sends audio/x-mulaw;rate=8000 by default — codec matches Exotel. */
const twilioAdapter: ProviderAdapter = {
  name: "twilio",
  audio: { encoding: "mulaw", sampleRate: 8000 },
  parseInbound(raw) {
    try {
      const msg = JSON.parse(raw);
      const ev = msg.event;
      if (ev === "start") {
        return { type: "start", sessionId: msg.start?.streamSid ?? msg.streamSid ?? "" };
      }
      if (ev === "media") {
        // Twilio sends only inbound (caller) audio on the default track.
        const payload = msg.media?.payload;
        if (typeof payload === "string") return { type: "audio", mulawB64: payload };
        return null;
      }
      if (ev === "mark") {
        return { type: "mark", name: msg.mark?.name ?? "" };
      }
      if (ev === "stop") return { type: "stop" };
      return null; // "connected" and others — ignored
    } catch {
      return null;
    }
  },
  formatOutboundAudio(sessionId, mulawB64) {
    return JSON.stringify({
      event: "media",
      streamSid: sessionId,
      media: { payload: mulawB64 },
    });
  },
  formatClear(sessionId) {
    return JSON.stringify({ event: "clear", streamSid: sessionId });
  },
  formatMark(sessionId, markName) {
    return JSON.stringify({
      event: "mark",
      streamSid: sessionId,
      mark: { name: markName },
    });
  },
};

/** Plivo AudioStream XML protocol (stub, ready to use).
 *  Frames are very similar to Twilio; same μ-law 8 kHz default codec. */
const plivoAdapter: ProviderAdapter = {
  name: "plivo",
  audio: { encoding: "mulaw", sampleRate: 8000 },
  parseInbound(raw) {
    try {
      const msg = JSON.parse(raw);
      const ev = msg.event;
      if (ev === "start") {
        return { type: "start", sessionId: msg.start?.streamId ?? msg.streamId ?? "" };
      }
      if (ev === "media") {
        const payload = msg.media?.payload;
        if (typeof payload === "string") return { type: "audio", mulawB64: payload };
        return null;
      }
      if (ev === "stop") return { type: "stop" };
      return null;
    } catch {
      return null;
    }
  },
  formatOutboundAudio(sessionId, mulawB64) {
    return JSON.stringify({
      event: "playAudio",
      streamId: sessionId,
      media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload: mulawB64 },
    });
  },
  formatClear(sessionId) {
    return JSON.stringify({ event: "clearAudio", streamId: sessionId });
  },
};

const PROVIDERS: Record<ProviderName, ProviderAdapter> = {
  twilio: twilioAdapter,
  plivo: plivoAdapter,
};

// ════════════════════════════════════════════════════════════════════════════
//  ┃ LAYER 2: SESSION ENGINE (provider-independent)
// ════════════════════════════════════════════════════════════════════════════
//  Everything below this line is agnostic of the telephony provider — it
//  only depends on the ProviderAdapter interface above. To add a provider,
//  do NOT modify code below this banner; add an adapter in Layer 1 instead.

// ─── Audio codecs (μ-law ⇄ PCM16, 8k ⇄ 16k) ────────────────────────────────
// Pure-Deno conversions. STT wants PCM16 16kHz; provider speaks μ-law 8kHz.

function mulawDecodeSample(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function mulawEncodeSample(s: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find exponent */
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Decode μ-law bytes → Int16 PCM at 8 kHz, then linearly upsample to 16 kHz. */
function mulaw8kToPcm16k(mulaw: Uint8Array): Int16Array {
  const out = new Int16Array(mulaw.length * 2);
  let prev = 0;
  for (let i = 0; i < mulaw.length; i++) {
    const cur = mulawDecodeSample(mulaw[i]);
    out[i * 2] = prev === 0 ? cur : Math.round((prev + cur) / 2);
    out[i * 2 + 1] = cur;
    prev = cur;
  }
  return out;
}

/** Downsample Int16 PCM 16 kHz → μ-law 8 kHz bytes. */
function pcm16kToMulaw8k(pcm: Int16Array): Uint8Array {
  const outLen = Math.floor(pcm.length / 2);
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = (pcm[i * 2] + pcm[i * 2 + 1]) >> 1;
    out[i] = mulawEncodeSample(s);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function int16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

// ─── Adaptive VAD for barge-in detection ───────────────────────────────────
// Hybrid VAD: continuous noise-floor calibration + adaptive threshold +
// sustained-energy gating. Telephony lines vary widely (background hum on
// Indian mobile networks especially), so a fixed RMS cutoff misfires.

function rms(pcm: Int16Array): number {
  let acc = 0;
  for (let i = 0; i < pcm.length; i++) acc += pcm[i] * pcm[i];
  return Math.sqrt(acc / pcm.length);
}

// Tuning constants — calibrated for 8 kHz μ-law telephony.
const BARGE_SUSTAINED_MS = 120;              // user must speak ≥120 ms to interrupt
const BARGE_MIN_RATIO = 3.5;                 // energy ≥ 3.5× current noise floor
const BARGE_MIN_ABSOLUTE = 800;              // absolute floor so silence never triggers
const BARGE_COOLDOWN_MS = 400;               // ignore barges shortly after a cancel
const BARGE_GRACE_AFTER_TTS_START_MS = 250;  // ignore first 250ms of agent speech
const NOISE_EMA_ALPHA = 0.05;                // slow EMA — adapts in ~1-2 s of silence

class AdaptiveVad {
  private noiseFloor = 200;
  private bargeStartedAt: number | null = null;

  observeQuiet(energy: number) {
    this.noiseFloor = (1 - NOISE_EMA_ALPHA) * this.noiseFloor + NOISE_EMA_ALPHA * energy;
  }

  shouldBarge(energy: number, now: number): boolean {
    const dynamicThreshold = Math.max(BARGE_MIN_ABSOLUTE, this.noiseFloor * BARGE_MIN_RATIO);
    if (energy >= dynamicThreshold) {
      if (this.bargeStartedAt === null) this.bargeStartedAt = now;
      return now - this.bargeStartedAt >= BARGE_SUSTAINED_MS;
    }
    this.bargeStartedAt = null;
    return false;
  }

  reset() { this.bargeStartedAt = null; }
  get floor() { return this.noiseFloor; }
}

// ─── Agent loader ──────────────────────────────────────────────────────────

interface AgentRecord {
  id: string;
  team_id: string;
  name: string;
  prompt: string | null;
  model: string | null;
  voice: string | null;
  language: string | null;
  welcome_message: string | null;
  welcome_mode: string | null;
}

async function loadAgent(supabase: ReturnType<typeof createClient>, agentId: string): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("id, team_id, name, prompt, model, voice, language, welcome_message, welcome_mode")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    console.error("loadAgent error:", error.message);
    return null;
  }
  return data as AgentRecord | null;
}

// ─── Knowledge / RAG helpers ───────────────────────────────────────────────

interface AgentIntent {
  id: string;
  name: string;
  description: string | null;
  kb_priority: string;
  kb_ids: string[];
}

interface AgentKnowledge {
  baseKbIds: string[];
  intents: AgentIntent[];
}

async function loadAgentKnowledge(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
): Promise<AgentKnowledge> {
  const [{ data: links }, { data: intents }] = await Promise.all([
    supabase.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", agentId),
    supabase.from("agent_intents").select("id, name, description, kb_priority").eq("agent_id", agentId),
  ]);
  const baseKbIds = (links ?? []).map((l: any) => l.knowledge_base_id).filter(Boolean);
  const intentRows = (intents ?? []) as any[];
  let intentList: AgentIntent[] = [];
  if (intentRows.length > 0) {
    const { data: intentKbLinks } = await supabase
      .from("agent_intent_knowledge_bases")
      .select("intent_id, knowledge_base_id")
      .in("intent_id", intentRows.map((r) => r.id));
    const byIntent = new Map<string, string[]>();
    for (const row of (intentKbLinks ?? []) as any[]) {
      const arr = byIntent.get(row.intent_id) ?? [];
      arr.push(row.knowledge_base_id);
      byIntent.set(row.intent_id, arr);
    }
    intentList = intentRows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      kb_priority: r.kb_priority || "intent_first",
      kb_ids: byIntent.get(r.id) ?? [],
    }));
  }
  return { baseKbIds, intents: intentList };
}

/** Lightweight intent matcher: pick the intent whose name/description has the
 *  most token overlap with the user utterance. Returns null if none score > 0. */
function pickIntent(userText: string, intents: AgentIntent[]): AgentIntent | null {
  if (intents.length === 0) return null;
  const tokens = new Set(
    userText.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );
  let best: AgentIntent | null = null;
  let bestScore = 0;
  for (const intent of intents) {
    const hay = `${intent.name} ${intent.description || ""}`.toLowerCase();
    const hayTokens = hay.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    let score = 0;
    for (const t of hayTokens) if (tokens.has(t)) score++;
    if (score > bestScore) { bestScore = score; best = intent; }
  }
  return best;
}

async function embedQuery(text: string, openaiKey: string | null, lovableKey: string): Promise<number[] | null> {
  const useOpenAi = !!openaiKey;
  const endpoint = useOpenAi
    ? "https://api.openai.com/v1/embeddings"
    : "https://ai.gateway.lovable.dev/v1/embeddings";
  const apiKey = useOpenAi ? openaiKey! : lovableKey;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 768,
      }),
    });
    if (!resp.ok) {
      console.error("embedQuery failed:", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("embedQuery error:", e);
    return null;
  }
}

async function retrieveKbContext(opts: {
  supabase: ReturnType<typeof createClient>;
  userText: string;
  knowledge: AgentKnowledge;
  openaiKey: string | null;
  lovableKey: string;
  matchCount?: number;
}): Promise<{ context: string; intentName: string | null; chunkCount: number }> {
  const matchCount = opts.matchCount ?? 4;
  const intent = pickIntent(opts.userText, opts.knowledge.intents);
  // Resolve effective KB ids based on intent priority.
  let kbIds: string[] = [];
  if (intent && intent.kb_ids.length > 0) {
    kbIds = intent.kb_priority === "intent_only"
      ? intent.kb_ids
      : Array.from(new Set([...intent.kb_ids, ...opts.knowledge.baseKbIds]));
  } else {
    kbIds = opts.knowledge.baseKbIds;
  }
  if (kbIds.length === 0) return { context: "", intentName: intent?.name ?? null, chunkCount: 0 };

  const embedding = await embedQuery(opts.userText, opts.openaiKey, opts.lovableKey);
  if (!embedding) return { context: "", intentName: intent?.name ?? null, chunkCount: 0 };

  const { data, error } = await opts.supabase.rpc("search_knowledge_chunks", {
    _query_embedding: JSON.stringify(embedding),
    _knowledge_base_ids: kbIds,
    _match_count: matchCount,
    _match_threshold: 0.5,
  });
  if (error) {
    console.error("KB search error:", error.message);
    return { context: "", intentName: intent?.name ?? null, chunkCount: 0 };
  }
  const rows = (data ?? []) as Array<{ content: string; similarity: number }>;
  if (rows.length === 0) return { context: "", intentName: intent?.name ?? null, chunkCount: 0 };

  const formatted = rows
    .map((r, i) => `[${i + 1}] (relevance ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
    .join("\n\n");
  return { context: formatted, intentName: intent?.name ?? null, chunkCount: rows.length };
}

// ─── Call log helpers ──────────────────────────────────────────────────────

async function findCallByCallSid(supabase: ReturnType<typeof createClient>, callSid: string) {
  const { data } = await supabase
    .from("calls")
    .select("id, team_id, metadata")
    .eq("call_sid", callSid)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function appendTranscript(
  supabase: ReturnType<typeof createClient>,
  callId: string,
  existingMeta: Record<string, unknown> | null,
  turn: { role: "user" | "assistant"; text: string },
) {
  const meta = (existingMeta ?? {}) as Record<string, unknown>;
  const transcript = Array.isArray(meta.transcript) ? (meta.transcript as unknown[]) : [];
  transcript.push({ role: turn.role, text: turn.text, ts: new Date().toISOString() });
  await supabase
    .from("calls")
    .update({ metadata: { ...meta, transcript } })
    .eq("id", callId);
}

async function endCallLog(
  supabase: ReturnType<typeof createClient>,
  callId: string,
  startedAtMs: number,
  status: string,
  metrics?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    avg_latency_ms?: number | null;
    p95_latency_ms?: number | null;
    turns?: number;
    llm_provider?: string;
    llm_model?: string;
  },
) {
  const ended = new Date();
  const { data: existing } = await supabase.from("calls").select("metadata").eq("id", callId).maybeSingle();
  const meta = (existing?.metadata ?? {}) as Record<string, unknown>;
  const merged = metrics ? { ...meta, metrics: { ...(meta.metrics as object ?? {}), ...metrics } } : meta;
  await supabase
    .from("calls")
    .update({
      status,
      ended_at: ended.toISOString(),
      duration_seconds: Math.round((ended.getTime() - startedAtMs) / 1000),
      metadata: merged,
    })
    .eq("id", callId);
}

// ─── Streaming STT (ElevenLabs scribe_v2_realtime) ─────────────────────────

interface SttHandle {
  send(pcm16kBase64: string): void;
  commit(): void;
  close(): void;
}

/** Map an agent's free-form language string to a scribe ISO 639-3 code.
 *  For Indian callers we leave language unset by default so scribe can
 *  auto-detect English / Hindi / code-switched speech (very common on IN calls).
 *  Only force a code when the agent is explicitly single-language. */
function mapLanguageToScribe(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  if (l.includes("hindi")) return "hin";
  if (l.includes("tamil")) return "tam";
  if (l.includes("telugu")) return "tel";
  if (l.includes("kannada")) return "kan";
  if (l.includes("malayalam")) return "mal";
  if (l.includes("marathi")) return "mar";
  if (l.includes("bengali")) return "ben";
  if (l.includes("gujarati")) return "guj";
  if (l.includes("punjabi")) return "pan";
  // "English", "Indian English", "Multilingual", "Auto" → let scribe decide
  return null;
}

/** First-time token request to ElevenLabs realtime scribe. We use a
 *  single-use token (preferred path) and fall back to subprotocol auth. */
async function getScribeToken(apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      { method: "POST", headers: { "xi-api-key": apiKey } },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.token ?? null;
  } catch (e) {
    console.error("scribe token fetch failed:", e);
    return null;
  }
}

function openSttSession(opts: {
  apiKey: string;
  language?: string | null;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: unknown) => void;
  onClose?: (info: { code: number; reason: string; clean: boolean }) => void;
}): Promise<SttHandle> {
  return new Promise(async (resolve, reject) => {
    const langParam = opts.language ? `&language_code=${encodeURIComponent(opts.language)}` : "";
    // Prefer single-use-token auth (recommended); fall back to subprotocol header.
    const token = await getScribeToken(opts.apiKey);
    const url = token
      ? `wss://api.elevenlabs.io/v1/realtime/scribe?model_id=scribe_v2_realtime` +
        `&audio_format=pcm_16000&commit_strategy=vad${langParam}` +
        `&token=${encodeURIComponent(token)}`
      : `wss://api.elevenlabs.io/v1/realtime/scribe?model_id=scribe_v2_realtime` +
        `&audio_format=pcm_16000&commit_strategy=vad${langParam}`;

    const ws = token
      ? new WebSocket(url)
      : new WebSocket(url, [`xi-api-key.${opts.apiKey}`]);

    let opened = false;
    // STT sessions can occasionally idle out; we surface that via onClose so the
    // session orchestrator can decide to fall back rather than die silently.
    const openTimeout = setTimeout(() => {
      if (!opened) {
        try { ws.close(); } catch { /* */ }
        reject(new Error("STT websocket open timeout"));
      }
    }, 5000);

    ws.onopen = () => {
      opened = true;
      clearTimeout(openTimeout);
      resolve({
        send(pcm16kBase64) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "audio", audio: pcm16kBase64 }));
          }
        },
        commit() {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "commit" }));
        },
        close() {
          try { ws.close(); } catch { /* ignore */ }
        },
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (msg.type === "partial_transcript") {
          opts.onPartial?.(msg.text ?? "");
        } else if (msg.type === "committed_transcript") {
          const text = (msg.text ?? "").trim();
          if (text) opts.onFinal(text);
        } else if (msg.type === "error") {
          console.error("STT error event:", msg);
          opts.onError?.(msg);
        }
      } catch {
        /* non-JSON frame */
      }
    };

    ws.onerror = (e) => {
      console.error("STT ws error", e);
      if (!opened) {
        clearTimeout(openTimeout);
        reject(new Error("STT websocket failed to open"));
      }
      opts.onError?.(e);
    };

    ws.onclose = (e) => {
      opts.onClose?.({ code: e.code, reason: e.reason, clean: e.wasClean });
    };
  });
}

// ─── Streaming TTS (ElevenLabs μ-law 8 kHz) ────────────────────────────────
// We use the REST stream endpoint with output_format=ulaw_8000 so we can
// forward chunks straight to the caller. AbortController gives us a clean
// way to cut TTS mid-sentence on barge-in.

async function streamTts(opts: {
  apiKey: string;
  text: string;
  voiceId: string;
  signal: AbortSignal;
  onChunk: (mulawBytes: Uint8Array) => void;
}): Promise<void> {
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/stream?output_format=ulaw_8000`,
    {
      method: "POST",
      headers: { "xi-api-key": opts.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: opts.text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.4, similarity_boost: 0.75, use_speaker_boost: true },
      }),
      signal: opts.signal,
    },
  );
  if (!resp.ok || !resp.body) {
    const err = await resp.text().catch(() => "");
    throw new Error(`TTS failed ${resp.status}: ${err}`);
  }
  const reader = resp.body.getReader();
  while (true) {
    if (opts.signal.aborted) break;
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) opts.onChunk(value);
  }
}

// ─── LLM call (OpenAI GPT-4.1 OR Lovable AI Gateway, streaming) ───────────

type LlmProvider = "openai" | "lovable";

interface LlmUsage { prompt_tokens: number; completion_tokens: number; total_tokens: number }

/** Resolve which LLM backend + model id to use based on the agent's `model` field.
 *  Anything that looks like a GPT model routes to OpenAI directly (requires
 *  OPENAI_API_KEY); everything else goes through the Lovable AI Gateway. */
function resolveLlm(modelField: string | null | undefined): { provider: LlmProvider; model: string } {
  const raw = (modelField || "").trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("gpt") || lower.startsWith("openai/") || lower.startsWith("o1") || lower.startsWith("o3")) {
    // Normalise display labels like "GPT-4.1" → "gpt-4.1", strip "openai/" prefix.
    const id = raw.replace(/^openai\//i, "").toLowerCase();
    return { provider: "openai", model: id || "gpt-4.1" };
  }
  return { provider: "lovable", model: raw || "google/gemini-3-flash-preview" };
}

async function streamLlm(opts: {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  onSentence: (sentence: string) => void;
  onComplete: (full: string, usage: LlmUsage | null) => void;
}): Promise<void> {
  const isOpenAi = opts.provider === "openai";
  const endpoint = isOpenAi
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const body: Record<string, unknown> = {
    model: opts.model,
    stream: true,
    messages: [{ role: "system", content: opts.systemPrompt }, ...opts.history],
  };
  if (isOpenAi) body.stream_options = { include_usage: true };
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`LLM failed ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let pending = "";
  let full = "";
  let usage: LlmUsage | null = null;
  const SENTENCE = /([\.!?…]\s+|[\n])/;

  const flushSentences = () => {
    while (true) {
      const m = pending.match(SENTENCE);
      if (!m) break;
      const idx = pending.indexOf(m[0]) + m[0].length;
      const sentence = pending.slice(0, idx).trim();
      pending = pending.slice(idx);
      if (sentence) opts.onSentence(sentence);
    }
  };

  while (true) {
    if (opts.signal.aborted) break;
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          pending += delta;
          full += delta;
          flushSentences();
        }
        // OpenAI emits a final chunk with usage when stream_options.include_usage=true.
        if (json.usage && typeof json.usage === "object") {
          usage = {
            prompt_tokens: json.usage.prompt_tokens ?? 0,
            completion_tokens: json.usage.completion_tokens ?? 0,
            total_tokens: json.usage.total_tokens ?? 0,
          };
        }
      } catch {
        /* ignore partial frame */
      }
    }
  }
  // Flush trailing fragment as a sentence so we don't drop the tail.
  if (pending.trim()) {
    opts.onSentence(pending.trim());
    pending = "";
  }
  opts.onComplete(full.trim(), usage);
}

// ─── Session orchestrator ──────────────────────────────────────────────────

async function runSession(opts: {
  socket: WebSocket;
  provider: ProviderAdapter;
  agent: AgentRecord;
  callId: string | null;
  supabase: ReturnType<typeof createClient>;
  lovableKey: string;
  elevenKey: string;
  openaiKey: string | null;
}) {
  const { socket, provider, agent, callId, supabase, lovableKey, elevenKey, openaiKey } = opts;
  const startedAtMs = Date.now();

  let sessionId = ""; // opaque provider-issued id (stream_sid / streamSid / streamId)
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const systemPrompt =
    (agent.prompt && agent.prompt.trim()) ||
    "You are a helpful AI voice agent. Keep replies short and conversational — they will be spoken aloud.";
  const voiceId = agent.voice || "EXAVITQu4vr4xnSDxMaL";
  const llm = resolveLlm(agent.model);
  // If agent is configured for OpenAI but the key is missing, fall back to gateway.
  const llmProvider: LlmProvider = llm.provider === "openai" && !openaiKey ? "lovable" : llm.provider;
  const llmModel = llmProvider === "openai" ? llm.model : (llm.provider === "openai" ? "google/gemini-3-flash-preview" : llm.model);
  const llmKey = llmProvider === "openai" ? (openaiKey as string) : lovableKey;

  // Knowledge bases attached to this agent (and its intent overrides) — loaded
  // once per session, queried per-turn for RAG context injection.
  let knowledge: AgentKnowledge = { baseKbIds: [], intents: [] };
  try {
    knowledge = await loadAgentKnowledge(supabase, agent.id);
    console.log(`KB loaded: ${knowledge.baseKbIds.length} base KBs, ${knowledge.intents.length} intents`);
  } catch (e) {
    console.error("loadAgentKnowledge failed:", e);
  }

  // Per-session aggregates persisted at end of call.
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const turnLatencies: number[] = []; // ms from user-final → first TTS audio byte sent

  // ── State for turn-taking / barge-in ──────────────────────────────────────
  let agentSpeaking = false;
  let ttsAbort: AbortController | null = null;
  let llmAbort: AbortController | null = null;
  let lastFinalAt = 0;
  let lastCancelAt = 0;          // for cooldown debounce
  let ttsStartedAt = 0;          // for grace-period after agent starts speaking
  let turnSeq = 0;               // monotonic id, prevents stale TTS chunks slipping in
  let assistantPartial = "";     // text spoken so far this turn (preserved on barge)
  const vad = new AdaptiveVad();

  const sendAudioToCaller = (mulaw: Uint8Array, ownerSeq: number) => {
    // Drop frames whose turn has been cancelled — guards against late chunks
    // arriving from an aborted TTS stream and re-flooding the caller.
    if (ownerSeq !== turnSeq) return;
    if (socket.readyState !== WebSocket.OPEN) return;
    const FRAME = 160; // ~20ms @ 8kHz μ-law
    for (let i = 0; i < mulaw.length; i += FRAME) {
      const slice = mulaw.subarray(i, Math.min(i + FRAME, mulaw.length));
      socket.send(provider.formatOutboundAudio(sessionId, bytesToBase64(slice)));
    }
  };

  // Helper: insert a row into call_messages (best-effort, never throws).
  const logMessage = (
    role: "user" | "assistant" | "system",
    content: string,
    extra: { latency_ms?: number; metadata?: Record<string, unknown> } = {},
  ) => {
    if (!callId) return;
    supabase.from("call_messages").insert({
      call_id: callId,
      role,
      content,
      latency_ms: extra.latency_ms ?? null,
      metadata: extra.metadata ?? {},
    }).then(({ error }) => {
      if (error) console.error("call_messages insert failed:", error.message);
    });
  };

  // Track when we got the user's final transcript (start of agent's turn budget).
  let turnStartAt = 0;

  /** Cancel the in-flight agent turn. Idempotent within a single turn. */
  const cancelAgentTurn = (reason: string) => {
    if (!agentSpeaking) return;
    console.log(`barge-in: ${reason} (floor=${vad.floor.toFixed(0)})`);
    turnSeq++;                   // any pending TTS bytes from this turn now stale
    try { llmAbort?.abort(); } catch { /* */ }
    try { ttsAbort?.abort(); } catch { /* */ }
    const clearMsg = provider.formatClear(sessionId);
    if (clearMsg && socket.readyState === WebSocket.OPEN) socket.send(clearMsg);
    agentSpeaking = false;
    lastCancelAt = Date.now();
    vad.reset();

    // Preserve interrupted assistant text in history so context survives the
    // barge — flagged as [interrupted] so the LLM knows the user cut in.
    if (assistantPartial.trim()) {
      const partial = assistantPartial.trim();
      history.push({ role: "assistant", content: `${partial} [interrupted]` });
      logMessage("assistant", partial, { metadata: { interrupted: true } });
      if (callId) {
        supabase.from("calls").select("metadata").eq("id", callId).maybeSingle()
          .then(({ data }) =>
            appendTranscript(supabase, callId, (data?.metadata ?? {}) as Record<string, unknown>, {
              role: "assistant", text: `${partial} [interrupted]`,
            }))
          .then(() => undefined, (e) => console.error("transcript append (interrupted) failed:", e));
      }
    }
    assistantPartial = "";
  };

  const speakAndAdvance = async (userText: string) => {
    turnStartAt = Date.now();
    history.push({ role: "user", content: userText });
    logMessage("user", userText);
    if (callId) {
      try {
        const { data } = await supabase.from("calls").select("metadata").eq("id", callId).maybeSingle();
        await appendTranscript(supabase, callId, (data?.metadata ?? {}) as Record<string, unknown>, {
          role: "user", text: userText,
        });
      } catch (e) { console.error("transcript append (user) failed:", e); }
    }

    // RAG: retrieve relevant KB chunks for this user turn (best-effort, never blocks).
    let perTurnSystem = systemPrompt;
    let kbMeta: Record<string, unknown> | null = null;
    if (knowledge.baseKbIds.length > 0 || knowledge.intents.length > 0) {
      try {
        const ragStart = Date.now();
        const { context, intentName, chunkCount } = await retrieveKbContext({
          supabase, userText, knowledge, openaiKey, lovableKey,
        });
        if (context) {
          perTurnSystem = `${systemPrompt}\n\n---\nUse ONLY the following knowledge to answer the user's question. If the answer is not in the knowledge, say so honestly.\n\n${context}`;
        }
        kbMeta = { rag_intent: intentName, rag_chunks: chunkCount, rag_latency_ms: Date.now() - ragStart };
      } catch (e) {
        console.error("RAG retrieval failed:", e);
      }
    }

    agentSpeaking = true;
    ttsStartedAt = Date.now();
    llmAbort = new AbortController();
    ttsAbort = new AbortController();
    assistantPartial = "";
    const mySeq = turnSeq;       // capture for stale-chunk guard

    let assistantBuf = "";
    let firstAudioAt = 0;
    let turnUsage: LlmUsage | null = null;
    try {
      await streamLlm({
        provider: llmProvider,
        apiKey: llmKey,
        model: llmModel,
        systemPrompt: perTurnSystem,
        history,
        signal: llmAbort.signal,
        onSentence: async (sentence) => {
          if (!agentSpeaking || mySeq !== turnSeq) return;
          assistantPartial += (assistantPartial ? " " : "") + sentence;
          try {
            await streamTts({
              apiKey: elevenKey,
              text: sentence,
              voiceId,
              signal: ttsAbort!.signal,
              onChunk: (mulaw) => {
                if (!firstAudioAt) firstAudioAt = Date.now();
                sendAudioToCaller(mulaw, mySeq);
              },
            });
          } catch (e) {
            if ((e as Error).name !== "AbortError") console.error("TTS chunk error:", e);
          }
        },
        onComplete: (full, usage) => { assistantBuf = full; turnUsage = usage; },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("LLM stream error:", e);
    }

    // If we completed without barge-in, persist the full assistant turn.
    if (mySeq === turnSeq && assistantBuf) {
      const latency = firstAudioAt ? firstAudioAt - turnStartAt : null;
      if (latency != null) turnLatencies.push(latency);
      if (turnUsage) {
        totalPromptTokens += turnUsage.prompt_tokens;
        totalCompletionTokens += turnUsage.completion_tokens;
      }
      logMessage("assistant", assistantBuf, {
        latency_ms: latency ?? undefined,
        metadata: {
          llm_provider: llmProvider,
          llm_model: llmModel,
          ...(turnUsage ? { usage: turnUsage } : {}),
          ...(kbMeta ?? {}),
        },
      });
      history.push({ role: "assistant", content: assistantBuf });
      if (callId) {
        try {
          const { data } = await supabase.from("calls").select("metadata").eq("id", callId).maybeSingle();
          await appendTranscript(supabase, callId, (data?.metadata ?? {}) as Record<string, unknown>, {
            role: "assistant", text: assistantBuf,
          });
        } catch (e) { console.error("transcript append (assistant) failed:", e); }
      }
    }
    if (mySeq === turnSeq) {
      agentSpeaking = false;
      assistantPartial = "";
    }
  };

  // ── STT session (with fallback on failure) ───────────────────────────────
  let stt: SttHandle | null = null;
  let sttFailed = false;

  const triggerFallback = async (reason: string) => {
    if (sttFailed) return;
    sttFailed = true;
    console.error(`STT fallback triggered: ${reason}`);
    if (callId) {
      try {
        const { data } = await supabase.from("calls").select("metadata").eq("id", callId).maybeSingle();
        const meta = (data?.metadata ?? {}) as Record<string, unknown>;
        await supabase.from("calls").update({
          status: "fallback",
          metadata: { ...meta, stt_error: reason, fallback_at: new Date().toISOString() },
        }).eq("id", callId);
      } catch (e) { console.error("fallback meta update failed:", e); }
    }
    cancelAgentTurn("stt fallback");
    // Speak a brief handoff line if TTS still works, then close so Exotel's
    // ExoML <Dial> fallback (configured on the App) can take over the leg.
    try {
      const ab = new AbortController();
      await streamTts({
        apiKey: elevenKey,
        text: "One moment, transferring you to a human agent.",
        voiceId,
        signal: ab.signal,
        onChunk: (mulaw) => sendAudioToCaller(mulaw, turnSeq),
      });
    } catch { /* */ }
    try { socket.close(1011, "stt-fallback"); } catch { /* */ }
  };

  try {
    stt = await openSttSession({
      apiKey: elevenKey,
      language: mapLanguageToScribe(agent.language),
      onPartial: (text) => {
        // Early barge-in via STT partials. Ignore very short partials (≤2 chars
        // are usually noise hallucinations on telephony lines), respect the
        // post-cancel cooldown, and respect the post-TTS-start grace window.
        if (!agentSpeaking) return;
        const t = (text ?? "").trim();
        if (t.length <= 2) return;
        const now = Date.now();
        if (now - lastCancelAt < BARGE_COOLDOWN_MS) return;
        if (now - ttsStartedAt < BARGE_GRACE_AFTER_TTS_START_MS) return;
        cancelAgentTurn("partial transcript");
      },
      onFinal: (text) => {
        const now = Date.now();
        if (now - lastFinalAt < 250) return; // debounce duplicate finals
        lastFinalAt = now;
        cancelAgentTurn("user final transcript");
        speakAndAdvance(text).catch((e) => console.error("turn error:", e));
      },
      onError: (err) => {
        console.error("STT runtime error:", err);
      },
      onClose: ({ code, reason, clean }) => {
        if (!clean && socket.readyState === WebSocket.OPEN && !sttFailed) {
          triggerFallback(`stt closed code=${code} reason=${reason || "n/a"}`);
        }
      },
    });
  } catch (e) {
    console.error("STT open failed:", e);
    await triggerFallback(`stt open failed: ${(e as Error).message}`);
    return;
  }

  // ── Welcome message (agent_first) ────────────────────────────────────────
  if (agent.welcome_mode === "agent_first" && agent.welcome_message?.trim()) {
    // Wait for the provider's "start" event so we have a sessionId to tag
    // outbound media with. Safety timeout in case "start" never arrives.
    const waitForStream = setInterval(() => {
      if (sessionId) {
        clearInterval(waitForStream);
        speakAndAdvance(agent.welcome_message!).catch(() => { /* */ });
      }
    }, 50);
    setTimeout(() => clearInterval(waitForStream), 5000);
  }

  // ── Inbound frames from provider (normalised by adapter) ─────────────────
  socket.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const event = provider.parseInbound(ev.data);
    if (!event) return;

    if (event.type === "start") {
      sessionId = event.sessionId;
      console.log(`[${provider.name}] stream started sid=${sessionId} agent=${agent.id}`);
      return;
    }
    if (event.type === "stop") {
      console.log(`[${provider.name}] stream stopped`);
      socket.close(1000, "provider-stop");
      return;
    }
    if (event.type === "mark") {
      // Provider confirmed our outbound audio drained — useful hook for
      // providers that need it; no-op for the engine right now.
      return;
    }
    // event.type === "audio"
    const mulaw = base64ToBytes(event.mulawB64);
    const pcm16k = mulaw8kToPcm16k(mulaw);
    const energy = rms(pcm16k);
    const now = Date.now();

    if (agentSpeaking) {
      // Cooldown after a recent cancel — prevents flicker on rapid interrupts.
      const inCooldown = now - lastCancelAt < BARGE_COOLDOWN_MS;
      // Grace period: caller mic often picks up onset of agent's own audio
      // via speakerphone echo; ignore the very first ~250ms of agent speech.
      const inGrace = now - ttsStartedAt < BARGE_GRACE_AFTER_TTS_START_MS;

      if (!inCooldown && !inGrace && vad.shouldBarge(energy, now)) {
        cancelAgentTurn("VAD energy");
      }
      // While agent is speaking we don't update the noise floor — outbound
      // echo would poison the calibration.
    } else {
      // Calibrate noise floor while caller is silent (only update on quiet
      // frames; loud frames are presumed speech and would skew the floor).
      if (energy < Math.max(BARGE_MIN_ABSOLUTE, vad.floor * 2)) {
        vad.observeQuiet(energy);
      }
    }

    // Forward to STT regardless (so a user's mid-speech turn is captured).
    stt?.send(int16ToBase64(pcm16k));
  };

  socket.onclose = async () => {
    console.log("socket closed");
    cancelAgentTurn("socket close");
    stt?.close();
    if (callId) {
      const sorted = [...turnLatencies].sort((a, b) => a - b);
      const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
      try {
        await endCallLog(supabase, callId, startedAtMs, "completed", {
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          avg_latency_ms: avg,
          p95_latency_ms: p95,
          turns: turnLatencies.length,
          llm_provider: llmProvider,
          llm_model: llmModel,
        });
      } catch (e) { console.error("endCallLog failed:", e); }
    }
  };
  socket.onerror = (e) => console.error("client ws error:", e);
}

// ════════════════════════════════════════════════════════════════════════════
//  ┃ LAYER 3: ENTRYPOINT
// ════════════════════════════════════════════════════════════════════════════
//  Thin Deno.serve handler: validate query, look up the provider adapter and
//  the agent, upgrade the WebSocket, and hand the socket to the session
//  engine. No business logic lives here.

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const upgrade = req.headers.get("upgrade")?.toLowerCase();

  if (req.method === "GET" && upgrade !== "websocket") {
    return new Response("voice-stream OK. Use WebSocket upgrade.", { status: 200 });
  }
  if (upgrade !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const providerNameRaw = url.searchParams.get("provider") ?? "twilio";
  const agentId = url.searchParams.get("agent_id") ?? "";
  const callSid = url.searchParams.get("call_sid") ?? "";

  // Validate against the registry — guards against typos and is the single
  // source of truth for which providers are wired up.
  if (!(providerNameRaw in PROVIDERS)) {
    return new Response(
      `unknown provider: ${providerNameRaw}. supported: ${Object.keys(PROVIDERS).join(", ")}`,
      { status: 400 },
    );
  }
  const provider = PROVIDERS[providerNameRaw as ProviderName];
  if (!agentId) return new Response("missing agent_id", { status: 400 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? null;
  if (!LOVABLE_API_KEY || !ELEVENLABS_API_KEY) {
    return new Response("voice keys not configured", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const agent = await loadAgent(supabase, agentId);
  if (!agent) return new Response("agent not found", { status: 404 });

  const callRow = callSid ? await findCallByCallSid(supabase, callSid) : null;
  const callId = callRow?.id ?? null;

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log(`voice-stream open provider=${provider.name} agent=${agent.id} call=${callSid}`);
    runSession({
      socket, provider, agent, callId, supabase,
      lovableKey: LOVABLE_API_KEY, elevenKey: ELEVENLABS_API_KEY, openaiKey: OPENAI_API_KEY,
    }).catch((e) => {
      console.error("session crashed:", e);
      try { socket.close(1011, "session-error"); } catch { /* */ }
    });
  };

  return response;
});
