// Pings each provider, upserts result into public.provider_health.
// Anyone authenticated can trigger; safe to call from the Admin UI or cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Probe = {
  provider: string;
  status: "ok" | "degraded" | "down" | "unknown";
  latency_ms: number | null;
  details: Record<string, unknown>;
};

async function timed(fn: () => Promise<Response>): Promise<{ res: Response | null; ms: number; err?: string }> {
  const t = Date.now();
  try {
    const res = await fn();
    return { res, ms: Date.now() - t };
  } catch (e) {
    return { res: null, ms: Date.now() - t, err: String(e) };
  }
}

async function probeOpenAI(): Promise<Probe> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { provider: "openai", status: "unknown", latency_ms: null, details: { reason: "no key" } };
  const { res, ms, err } = await timed(() =>
    fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }),
  );
  if (!res) return { provider: "openai", status: "down", latency_ms: ms, details: { err } };
  return {
    provider: "openai",
    status: res.ok ? (ms > 1500 ? "degraded" : "ok") : "down",
    latency_ms: ms,
    details: { http: res.status },
  };
}

async function probeElevenLabs(): Promise<Probe> {
  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return { provider: "elevenlabs", status: "unknown", latency_ms: null, details: { reason: "no key" } };
  const { res, ms, err } = await timed(() =>
    fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } }),
  );
  if (!res) return { provider: "elevenlabs", status: "down", latency_ms: ms, details: { err } };
  return {
    provider: "elevenlabs",
    status: res.ok ? (ms > 1500 ? "degraded" : "ok") : "down",
    latency_ms: ms,
    details: { http: res.status },
  };
}

async function probeTwilio(): Promise<Probe> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !tok) return { provider: "twilio", status: "unknown", latency_ms: null, details: { reason: "no creds" } };
  const auth = btoa(`${sid}:${tok}`);
  const { res, ms, err } = await timed(() =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
    }),
  );
  if (!res) return { provider: "twilio", status: "down", latency_ms: ms, details: { err } };
  return {
    provider: "twilio",
    status: res.ok ? (ms > 1500 ? "degraded" : "ok") : "down",
    latency_ms: ms,
    details: { http: res.status },
  };
}

async function probeLovableAI(): Promise<Probe> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { provider: "lovable_ai", status: "unknown", latency_ms: null, details: { reason: "no key" } };
  const { res, ms, err } = await timed(() =>
    fetch("https://ai.gateway.lovable.dev/v1/models", { headers: { Authorization: `Bearer ${key}` } }),
  );
  if (!res) return { provider: "lovable_ai", status: "down", latency_ms: ms, details: { err } };
  return {
    provider: "lovable_ai",
    status: res.ok ? (ms > 1500 ? "degraded" : "ok") : "down",
    latency_ms: ms,
    details: { http: res.status },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const probes = await Promise.all([probeOpenAI(), probeElevenLabs(), probeTwilio(), probeLovableAI()]);
    for (const p of probes) {
      await supabase.from("provider_health").upsert({
        provider: p.provider,
        status: p.status,
        latency_ms: p.latency_ms,
        last_checked_at: new Date().toISOString(),
        details: p.details,
      }, { onConflict: "provider" });
    }
    return new Response(JSON.stringify({ probes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
