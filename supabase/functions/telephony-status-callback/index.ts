// Twilio status callback - receives call lifecycle events (queued, ringing,
// in-progress, completed). Updates the matching call row with duration,
// final status, recording URL, and price.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

async function validateTwilioSignature(req: Request, bodyText: string): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) return true; // signature validation disabled
  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return false;
  const url = req.url;
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64 === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const bodyText = await req.text();
    const ok = await validateTwilioSignature(req, bodyText);
    if (!ok) {
      console.warn("Invalid Twilio signature on status callback");
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    const params = Object.fromEntries(new URLSearchParams(bodyText));
    const callSid = params.CallSid;
    if (!callSid) return new Response("ok", { headers: corsHeaders });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const update: Record<string, unknown> = {};
    const status = params.CallStatus;
    if (status) update.status = status;
    if (params.CallDuration) update.duration_seconds = parseInt(params.CallDuration, 10);
    if (params.RecordingUrl) update.recording_url = params.RecordingUrl;
    if (status === "completed" || status === "failed" || status === "busy" || status === "no-answer" || status === "canceled") {
      update.ended_at = new Date().toISOString();
    }

    // Merge cost/raw into metadata using rpc-free read-modify-write
    const { data: existing } = await admin
      .from("calls")
      .select("metadata")
      .eq("call_sid", callSid)
      .maybeSingle();
    const meta = (existing?.metadata as Record<string, unknown>) || {};
    meta.last_status_callback = params;
    if (params.Price) meta.cost_amount = parseFloat(params.Price);
    if (params.PriceUnit) meta.cost_currency = params.PriceUnit;
    update.metadata = meta;

    const { error } = await admin.from("calls").update(update).eq("call_sid", callSid);
    if (error) console.error("calls update failed:", error);

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("status callback error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
