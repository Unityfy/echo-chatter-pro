// Provider-agnostic incoming-call webhook.
// URL: https://<project>.supabase.co/functions/v1/telephony-incoming-call?provider=<id>&token=<webhook_token>
//
// Routing logic is identical across providers — only parsing the inbound payload
// and rendering the control response are delegated to the provider adapter.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getProvider } from "../_telephony/registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

async function validateTwilioSignature(reqUrl: string, signature: string | null, params: Record<string, string>): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) return true; // disabled until token is configured
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = reqUrl;
  for (const k of sortedKeys) data += k + params[k];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64 === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider") || "twilio";
  const token = url.searchParams.get("token");

  let provider;
  try {
    provider = getProvider(providerId);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Twilio doesn't require a per-workspace token (single account, looked up via To number).
  // Other providers still require a token of >=16 chars.
  if (provider.id !== "twilio" && (!token || token.length < 16)) {
    return provider.renderControlResponse({ kind: "say_hangup", message: "This service is not configured. Goodbye." });
  }

  try {
    // Parse webhook body (form or JSON) + merge query params
    let payload: Record<string, string> = {};
    let rawBody = "";
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        rawBody = await req.text();
        payload = Object.fromEntries(new URLSearchParams(rawBody));
      } else if (ct.includes("application/json")) {
        payload = await req.json().catch(() => ({}));
      }
    }
    url.searchParams.forEach((v, k) => {
      if (k !== "token" && k !== "provider" && !(k in payload)) payload[k] = v;
    });

    // Twilio signature validation (only if TWILIO_AUTH_TOKEN configured)
    if (provider.id === "twilio" && req.method === "POST") {
      const sig = req.headers.get("X-Twilio-Signature");
      const formParams = Object.fromEntries(new URLSearchParams(rawBody));
      const valid = await validateTwilioSignature(req.url, sig, formParams);
      if (!valid) {
        console.warn("Rejected request: invalid Twilio signature");
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    // Provider parses its own payload shape
    const call = provider.parseIncomingWebhook(req, payload);

    if (!call.to_number) {
      return provider.renderControlResponse({ kind: "say_hangup", message: "Sorry, we could not determine the number called. Goodbye." });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Token → workspace lookup. For Twilio we resolve the workspace via the
    // called number directly (the Twilio account belongs to the workspace owner).
    let teamId: string | null = null;
    if (provider.id === "twilio" && call.to_number) {
      const candidates = [call.to_number, call.to_number.replace(/^\+/, ""), `+${call.to_number.replace(/^\+/, "")}`];
      const { data: pnRow } = await admin
        .from("phone_numbers")
        .select("team_id")
        .eq("provider", "twilio")
        .in("phone_number", candidates)
        .maybeSingle();
      teamId = pnRow?.team_id ?? null;
    }
    // TODO: knowlarity_accounts lookup once that table exists.

    if (!teamId) {
      return provider.renderControlResponse({ kind: "say_hangup", message: "This service is not configured. Goodbye." });
    }

    // Resolve number → agent
    const candidates = [call.to_number, call.to_number.replace(/^\+/, ""), `+${call.to_number.replace(/^\+/, "")}`];
    const { data: pn } = await admin
      .from("phone_numbers")
      .select("id, agent_id")
      .eq("team_id", teamId)
      .in("phone_number", candidates)
      .maybeSingle();

    const logCall = async (extra: Record<string, unknown>) => {
      try {
        const { error } = await admin.from("calls").insert({
          team_id: teamId,
          agent_id: pn?.agent_id ?? null,
          phone_number_id: pn?.id ?? null,
          provider: provider.id,
          call_sid: call.call_sid,
          direction: "inbound",
          from_number: call.from_number,
          to_number: call.to_number,
          ...extra,
        });
        if (error) console.error("call log failed:", error);
      } catch (e) {
        console.error("call log threw:", e);
      }
    };

    if (!pn) {
      await logCall({ status: "no-agent", metadata: { reason: "number_not_imported", payload } });
      return provider.renderControlResponse({ kind: "say_hangup", message: "Sorry, this number is not configured. Goodbye." });
    }

    if (!pn.agent_id) {
      const { data: team } = await admin.from("teams").select("fallback_number").eq("id", teamId).maybeSingle();
      if (team?.fallback_number) {
        await logCall({ status: "forwarded", metadata: { to: team.fallback_number, payload } });
        return provider.renderControlResponse({ kind: "forward", number: team.fallback_number });
      }
      await logCall({ status: "no-agent", metadata: { reason: "no_agent_no_fallback", payload } });
      return provider.renderControlResponse({ kind: "say_hangup", message: "No agent is available right now. Goodbye." });
    }

    const wsUrl =
      `${SUPABASE_URL.replace(/^https?:/, "wss:")}/functions/v1/voice-stream` +
      `?provider=${provider.id}&agent_id=${pn.agent_id}&call_sid=${encodeURIComponent(call.call_sid ?? "")}`;

    await logCall({
      status: "in-progress",
      answered_at: new Date().toISOString(),
      metadata: { ws_url: wsUrl, payload },
    });

    console.log(`[${provider.id}] routed call to agent ${pn.agent_id} in ${Date.now() - startedAt}ms`);
    return provider.renderControlResponse({ kind: "stream", ws_url: wsUrl });
  } catch (e) {
    console.error(`[${providerId}] incoming-call error:`, e);
    return provider.renderControlResponse({ kind: "say_hangup", message: "An unexpected error occurred. Goodbye." });
  }
});
