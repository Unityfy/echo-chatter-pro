// Real-time voice bridge for AI agents.
// Caller ── (provider WS, μ-law 8kHz) ──> [voice-stream]
//   STT (ElevenLabs scribe_v2_realtime, PCM 16k)
//     ──> LLM (Lovable AI Gateway, streaming)
//       ──> TTS (ElevenLabs streaming, μ-law 8k) ──> Caller
//
// Provider adapters (Exotel today, Twilio/Plivo tomorrow) live in the same
// file under PROVIDERS — each one knows how to (a) parse the provider's
// inbound JSON frames into raw 8kHz μ-law audio, and (b) format outbound
// audio frames the way the provider expects.
//
// URL: wss://<ref>.functions.supabase.co/voice-stream?provider=exotel&agent_id=...&call_sid=...
// Public (verify_jwt = false). Security relies on call_sid + agent ownership
// scoping; the function only loads agents that already exist server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── Types ─────────────────────────────────────────────────────────────────

type ProviderName = "exotel";

interface ProviderAdapter {
  name: ProviderName;
  /** Audio format that the provider sends/expects on the wire. */
  audio: { encoding: "mulaw"; sampleRate: 8000 };
  /** Parse a single inbound text frame from the provider WS. Returns:
   *  - { type: "audio", pcm8kMulawB64 } with base64 μ-law payload, or
   *  - { type: "start", streamSid } when the call begins, or
   *  - { type: "stop" } when the call ends, or
   *  - null for keepalives / unknown frames. */
  parseInbound(raw: string): InboundEvent | null;
  /** Wrap a base64 μ-law audio chunk in the provider's outbound frame format. */
  formatOutboundAudio(streamSid: string, mulawB64: string): string;
  /** Tell the provider to flush/clear its playout buffer (for barge-in). */
  formatClear(streamSid: string): string | null;
}

type InboundEvent =
  | { type: "start"; streamSid: string }
  | { type: "audio"; mulawB64: string }
  | { type: "stop" };

// ─── Provider adapters ─────────────────────────────────────────────────────

const PROVIDERS: Record<ProviderName, ProviderAdapter> = {
  // Exotel Voicebot Applet protocol.
  // Frames: { event: "start"|"media"|"stop", stream_sid, media: { payload } }
  exotel: {
    name: "exotel",
    audio: { encoding: "mulaw", sampleRate: 8000 },
    parseInbound(raw) {
      try {
        const msg = JSON.parse(raw);
        const ev = msg.event;
        if (ev === "start") {
          return { type: "start", streamSid: msg.stream_sid ?? msg.streamSid ?? "" };
        }
        if (ev === "media") {
          const payload = msg.media?.payload;
          if (typeof payload === "string") return { type: "audio", mulawB64: payload };
          return null;
        }
        if (ev === "stop") return { type: "stop" };
        return null; // mark, dtmf, etc. — ignored for now
      } catch {
        return null;
      }
    },
    formatOutboundAudio(streamSid, mulawB64) {
      return JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: { payload: mulawB64 },
      });
    },
    formatClear(streamSid) {
      return JSON.stringify({ event: "clear", stream_sid: streamSid });
    },
  },
};

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

// ─── Lightweight VAD for barge-in detection ────────────────────────────────
// We don't run STT during agent speech (too expensive); instead we watch
// inbound RMS energy on caller audio and trigger a barge-in if it stays
// above threshold for ~150 ms.

function rms(pcm: Int16Array): number {
  let acc = 0;
  for (let i = 0; i < pcm.length; i++) acc += pcm[i] * pcm[i];
  return Math.sqrt(acc / pcm.length);
}

const BARGE_RMS_THRESHOLD = 1200; // empirical for telephony μ-law
const BARGE_SUSTAINED_MS = 150;

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
) {
  const ended = new Date();
  await supabase
    .from("calls")
    .update({
      status,
      ended_at: ended.toISOString(),
      duration_seconds: Math.round((ended.getTime() - startedAtMs) / 1000),
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

// ─── LLM call (Lovable AI Gateway, streaming) ──────────────────────────────

async function streamLlm(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  onSentence: (sentence: string) => void;
  onComplete: (full: string) => void;
}): Promise<void> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: [{ role: "system", content: opts.systemPrompt }, ...opts.history],
    }),
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
  opts.onComplete(full.trim());
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
}) {
  const { socket, provider, agent, callId, supabase, lovableKey, elevenKey } = opts;
  const startedAtMs = Date.now();

  let streamSid = "";
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const systemPrompt =
    (agent.prompt && agent.prompt.trim()) ||
    "You are a helpful AI voice agent. Keep replies short and conversational — they will be spoken aloud.";
  const voiceId = agent.voice || "EXAVITQu4vr4xnSDxMaL";
  const model = agent.model || "google/gemini-3-flash-preview";

  // ── State for turn-taking / barge-in ──────────────────────────────────────
  let agentSpeaking = false;
  let ttsAbort: AbortController | null = null;
  let llmAbort: AbortController | null = null;
  let bargeStartedAt: number | null = null;
  let lastFinalAt = 0;

  const sendAudioToCaller = (mulaw: Uint8Array) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    // Chop into ~20ms frames (160 bytes @ 8kHz μ-law) for smooth playback.
    const FRAME = 160;
    for (let i = 0; i < mulaw.length; i += FRAME) {
      const slice = mulaw.subarray(i, Math.min(i + FRAME, mulaw.length));
      socket.send(provider.formatOutboundAudio(streamSid, bytesToBase64(slice)));
    }
  };

  const cancelAgentTurn = (reason: string) => {
    if (!agentSpeaking) return;
    console.log(`barge-in / cancel: ${reason}`);
    try { llmAbort?.abort(); } catch { /* */ }
    try { ttsAbort?.abort(); } catch { /* */ }
    const clearMsg = provider.formatClear(streamSid);
    if (clearMsg && socket.readyState === WebSocket.OPEN) socket.send(clearMsg);
    agentSpeaking = false;
  };

  const speakAndAdvance = async (userText: string) => {
    history.push({ role: "user", content: userText });
    if (callId) {
      try {
        const { data } = await supabase.from("calls").select("metadata").eq("id", callId).maybeSingle();
        await appendTranscript(supabase, callId, (data?.metadata ?? {}) as Record<string, unknown>, {
          role: "user", text: userText,
        });
      } catch (e) { console.error("transcript append (user) failed:", e); }
    }

    agentSpeaking = true;
    llmAbort = new AbortController();
    ttsAbort = new AbortController();

    let assistantBuf = "";
    try {
      await streamLlm({
        apiKey: lovableKey,
        model,
        systemPrompt,
        history,
        signal: llmAbort.signal,
        onSentence: async (sentence) => {
          if (!agentSpeaking) return;
          try {
            await streamTts({
              apiKey: elevenKey,
              text: sentence,
              voiceId,
              signal: ttsAbort!.signal,
              onChunk: (mulaw) => sendAudioToCaller(mulaw),
            });
          } catch (e) {
            if ((e as Error).name !== "AbortError") console.error("TTS chunk error:", e);
          }
        },
        onComplete: (full) => { assistantBuf = full; },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("LLM stream error:", e);
    }

    if (assistantBuf) {
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
    agentSpeaking = false;
  };

  // ── STT session ──────────────────────────────────────────────────────────
  let stt: SttHandle | null = null;
  try {
    stt = await openSttSession({
      apiKey: elevenKey,
      language: agent.language && agent.language.toLowerCase().startsWith("en") ? "eng" : null,
      onFinal: (text) => {
        const now = Date.now();
        if (now - lastFinalAt < 250) return; // debounce duplicate finals
        lastFinalAt = now;
        // If the agent was speaking and the user already barged in via VAD,
        // we already cancelled. If barge happened only on the final transcript,
        // cancel now.
        cancelAgentTurn("user final transcript");
        speakAndAdvance(text).catch((e) => console.error("turn error:", e));
      },
    });
  } catch (e) {
    console.error("STT open failed:", e);
    socket.close(1011, "stt-unavailable");
    return;
  }

  // ── Welcome message (agent_first) ────────────────────────────────────────
  if (agent.welcome_mode === "agent_first" && agent.welcome_message?.trim()) {
    // Wait for streamSid before speaking.
    const waitForStream = setInterval(() => {
      if (streamSid) {
        clearInterval(waitForStream);
        speakAndAdvance(agent.welcome_message!).catch(() => { /* */ });
      }
    }, 50);
    // Safety: clear after 5 s if start never arrived
    setTimeout(() => clearInterval(waitForStream), 5000);
  }

  // ── Inbound audio from provider ──────────────────────────────────────────
  socket.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const event = provider.parseInbound(ev.data);
    if (!event) return;

    if (event.type === "start") {
      streamSid = event.streamSid;
      console.log(`stream started sid=${streamSid} agent=${agent.id}`);
      return;
    }
    if (event.type === "stop") {
      console.log("stream stopped");
      socket.close(1000, "provider-stop");
      return;
    }
    // event.type === "audio"
    const mulaw = base64ToBytes(event.mulawB64);
    const pcm16k = mulaw8kToPcm16k(mulaw);

    // Barge-in: while agent is speaking, watch energy
    if (agentSpeaking) {
      const energy = rms(pcm16k);
      if (energy > BARGE_RMS_THRESHOLD) {
        if (bargeStartedAt === null) bargeStartedAt = Date.now();
        else if (Date.now() - bargeStartedAt > BARGE_SUSTAINED_MS) {
          cancelAgentTurn("VAD energy");
          bargeStartedAt = null;
        }
      } else {
        bargeStartedAt = null;
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
      try { await endCallLog(supabase, callId, startedAtMs, "completed"); }
      catch (e) { console.error("endCallLog failed:", e); }
    }
  };
  socket.onerror = (e) => console.error("client ws error:", e);
}

// ─── Entrypoint ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const upgrade = req.headers.get("upgrade")?.toLowerCase();

  if (req.method === "GET" && upgrade !== "websocket") {
    return new Response("voice-stream OK. Use WebSocket upgrade.", { status: 200 });
  }
  if (upgrade !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const providerName = (url.searchParams.get("provider") ?? "exotel") as ProviderName;
  const agentId = url.searchParams.get("agent_id") ?? "";
  const callSid = url.searchParams.get("call_sid") ?? "";

  const provider = PROVIDERS[providerName];
  if (!provider) return new Response(`unknown provider: ${providerName}`, { status: 400 });
  if (!agentId) return new Response("missing agent_id", { status: 400 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
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
      lovableKey: LOVABLE_API_KEY, elevenKey: ELEVENLABS_API_KEY,
    }).catch((e) => {
      console.error("session crashed:", e);
      try { socket.close(1011, "session-error"); } catch { /* */ }
    });
  };

  return response;
});
