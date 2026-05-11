// Twilio management endpoint - health check, search/buy/import numbers,
// configure webhook, place test calls. JWT-protected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured (connect Twilio first)");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${LOVABLE_API_KEY}`);
  headers.set("X-Connection-Api-Key", TWILIO_API_KEY);
  return fetch(`${GATEWAY_URL}${path}`, { ...init, headers });
}

function webhookUrl(): string {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/functions/v1/telephony-incoming-call?provider=twilio`;
}

function statusCallbackUrl(): string {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/functions/v1/telephony-status-callback?provider=twilio`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = String(body.action || "");
  const teamId = body.team_id ? String(body.team_id) : null;

  // For team-scoped actions, verify membership
  if (teamId && action !== "health") {
    const { data: member } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) return json({ error: "Not a team member" }, 403);
  }

  try {
    switch (action) {
      case "health": {
        const hasKey = !!Deno.env.get("TWILIO_API_KEY");
        if (!hasKey) {
          return json({ ok: false, configured: false, error: "Twilio not connected" });
        }
        const r = await gatewayFetch("/IncomingPhoneNumbers.json?PageSize=1");
        const data = await r.json().catch(() => ({}));
        return json({
          ok: r.ok,
          configured: true,
          status: r.status,
          account_sid: data?.incoming_phone_numbers?.[0]?.account_sid ?? null,
          signature_validation: !!Deno.env.get("TWILIO_AUTH_TOKEN"),
          webhook_url: webhookUrl(),
          error: r.ok ? null : (data?.message || `HTTP ${r.status}`),
        });
      }

      case "list-twilio-numbers": {
        const r = await gatewayFetch("/IncomingPhoneNumbers.json?PageSize=200");
        if (!r.ok) {
          const t = await r.text();
          return json({ error: `Twilio API error (${r.status}): ${t}` }, r.status);
        }
        const data = await r.json();
        return json({
          numbers: (data.incoming_phone_numbers || []).map((n: any) => ({
            sid: n.sid,
            phone_number: n.phone_number,
            friendly_name: n.friendly_name,
            voice_url: n.voice_url,
            voice_method: n.voice_method,
            status_callback: n.status_callback,
            capabilities: n.capabilities,
          })),
        });
      }

      case "search-available": {
        const country = String(body.country || "US").toUpperCase();
        const areaCode = body.area_code ? `&AreaCode=${encodeURIComponent(body.area_code)}` : "";
        const contains = body.contains ? `&Contains=${encodeURIComponent(body.contains)}` : "";
        const r = await gatewayFetch(
          `/AvailablePhoneNumbers/${country}/Local.json?PageSize=20${areaCode}${contains}`,
        );
        if (!r.ok) {
          const t = await r.text();
          return json({ error: `Twilio search error (${r.status}): ${t}` }, r.status);
        }
        const data = await r.json();
        return json({
          numbers: (data.available_phone_numbers || []).map((n: any) => ({
            phone_number: n.phone_number,
            friendly_name: n.friendly_name,
            locality: n.locality,
            region: n.region,
            iso_country: n.iso_country,
            capabilities: n.capabilities,
          })),
        });
      }

      case "purchase-number": {
        if (!teamId) return json({ error: "team_id required" }, 400);
        const phone = String(body.phone_number || "");
        if (!phone) return json({ error: "phone_number required" }, 400);
        const form = new URLSearchParams();
        form.set("PhoneNumber", phone);
        form.set("VoiceUrl", webhookUrl());
        form.set("VoiceMethod", "POST");
        form.set("StatusCallback", statusCallbackUrl());
        form.set("StatusCallbackMethod", "POST");
        const r = await gatewayFetch("/IncomingPhoneNumbers.json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: `Twilio purchase error (${r.status}): ${data?.message || ""}` }, r.status);
        // Insert into phone_numbers
        const { data: row, error } = await admin.from("phone_numbers").insert({
          team_id: teamId,
          phone_number: data.phone_number,
          provider: "twilio",
          provider_number_id: data.sid,
          status: "active",
          agent_id: body.agent_id || null,
        }).select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ number: row, twilio: data });
      }

      case "import-numbers": {
        if (!teamId) return json({ error: "team_id required" }, 400);
        const r = await gatewayFetch("/IncomingPhoneNumbers.json?PageSize=200");
        if (!r.ok) {
          const t = await r.text();
          return json({ error: `Twilio API error (${r.status}): ${t}` }, r.status);
        }
        const data = await r.json();
        const list: any[] = data.incoming_phone_numbers || [];
        const sids = body.sids as string[] | undefined;
        const filtered = sids?.length ? list.filter((n) => sids.includes(n.sid)) : list;

        const { data: existing } = await admin
          .from("phone_numbers")
          .select("phone_number, provider_number_id")
          .eq("team_id", teamId)
          .eq("provider", "twilio");
        const existingSet = new Set((existing || []).map((e: any) => e.provider_number_id || e.phone_number));

        const toInsert = filtered
          .filter((n) => !existingSet.has(n.sid) && !existingSet.has(n.phone_number))
          .map((n) => ({
            team_id: teamId,
            phone_number: n.phone_number,
            provider: "twilio",
            provider_number_id: n.sid,
            status: "active",
            agent_id: body.agent_id || null,
          }));
        if (toInsert.length === 0) return json({ imported: 0, skipped: filtered.length });
        const { error } = await admin.from("phone_numbers").insert(toInsert);
        if (error) return json({ error: error.message }, 500);
        return json({ imported: toInsert.length, skipped: filtered.length - toInsert.length });
      }

      case "configure-webhook": {
        const sid = String(body.sid || "");
        if (!sid) return json({ error: "sid required" }, 400);
        const form = new URLSearchParams();
        form.set("VoiceUrl", webhookUrl());
        form.set("VoiceMethod", "POST");
        form.set("StatusCallback", statusCallbackUrl());
        form.set("StatusCallbackMethod", "POST");
        const r = await gatewayFetch(`/IncomingPhoneNumbers/${sid}.json`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: `Twilio configure error (${r.status}): ${data?.message || ""}` }, r.status);
        return json({ ok: true, voice_url: data.voice_url, status_callback: data.status_callback });
      }

      case "test-call": {
        if (!teamId) return json({ error: "team_id required" }, 400);
        const from = String(body.from || "");
        const to = String(body.to || "");
        if (!from || !to) return json({ error: "from and to required" }, 400);
        // Use the standard incoming-call webhook so the agent answers as if it were inbound.
        const form = new URLSearchParams();
        form.set("To", to);
        form.set("From", from);
        form.set("Url", webhookUrl());
        form.set("Method", "POST");
        form.set("StatusCallback", statusCallbackUrl());
        form.set("StatusCallbackMethod", "POST");
        const r = await gatewayFetch("/Calls.json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: `Twilio call error (${r.status}): ${data?.message || ""}` }, r.status);
        return json({ call_sid: data.sid, status: data.status });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("twilio-management error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
