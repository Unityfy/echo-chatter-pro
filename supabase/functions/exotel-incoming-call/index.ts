// Public webhook endpoint that Exotel calls when an incoming call arrives.
// URL pattern (configure in Exotel "App"):
//   https://<project-ref>.supabase.co/functions/v1/exotel-incoming-call?token=<webhook_token>
//
// Security:
//   1. Shared secret token in URL (per-workspace, stored in exotel_accounts.webhook_token)
//   2. Optional Exotel IP allowlist (defense in depth)
//
// Response: ExoML XML. If an agent is assigned to the called number, we return
// a <Response><Connect><Voicebot url="wss://..." /></Connect></Response> pointing
// at our streaming WS edge function. Otherwise we <Dial> the team's fallback_number,
// or <Say>+<Hangup>.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Exotel publishes its source IPs here:
// https://developer.exotel.com/api/#exotel-ip-addresses
// Keeping a conservative list — empty array disables the check.
const EXOTEL_IP_ALLOWLIST: string[] = [
  // Examples (update with current Exotel IPs as needed):
  // "3.108.0.0/16", "13.232.0.0/16", "65.0.0.0/16",
];

function xml(body: string, status = 200, context: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    evt: "xml_response",
    status,
    xml: body,
    ...context,
  }));
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
  });
}

function sayAndHangup(message: string, context: Record<string, unknown> = {}) {
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="female">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`,
    200,
    { reason: "say_and_hangup", message, ...context },
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );
}

function ipInCidr(ip: string, cidr: string): boolean {
  // Simple IPv4 CIDR check — good enough for an allowlist filter.
  if (!cidr.includes("/")) return ip === cidr;
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const toLong = (s: string) =>
    s.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toLong(ip) & mask) === (toLong(range) & mask);
}

function isAllowedIp(ip: string | null): boolean {
  if (EXOTEL_IP_ALLOWLIST.length === 0) return true; // disabled
  if (!ip) return false;
  return EXOTEL_IP_ALLOWLIST.some((cidr) => ipInCidr(ip, cidr));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const testMode = url.searchParams.get("test") === "1";
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    null;

  // Capture raw body once so we can log it AND still parse it below.
  const contentType = req.headers.get("content-type") || "";
  let rawBody = "";
  let parsedBody: Record<string, string> = {};
  if (req.method === "POST") {
    try {
      rawBody = await req.text();
      if (contentType.includes("application/x-www-form-urlencoded")) {
        parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
      } else if (contentType.includes("application/json") && rawBody) {
        try { parsedBody = JSON.parse(rawBody); } catch { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  }

  const queryParams = Object.fromEntries(url.searchParams);
  const sniffFrom = parsedBody.From ?? parsedBody.from ?? parsedBody.CallFrom ?? queryParams.From ?? queryParams.from ?? queryParams.CallFrom ?? null;
  const sniffTo = parsedBody.To ?? parsedBody.to ?? parsedBody.CallTo ?? parsedBody.DialWhomNumber ?? queryParams.To ?? queryParams.to ?? queryParams.CallTo ?? queryParams.DialWhomNumber ?? null;

  console.log(JSON.stringify({
    evt: "incoming_call_webhook",
    timestamp: new Date().toISOString(),
    method: req.method,
    ip: clientIp,
    test_mode: testMode,
    from: sniffFrom,
    to: sniffTo,
    content_type: contentType,
    query_params: { ...queryParams, token: token ? `${token.slice(0, 4)}…(len:${token.length})` : null },
    raw_body: rawBody || null,
    parsed_body: parsedBody,
    headers: {
      "user-agent": req.headers.get("user-agent"),
      "x-forwarded-for": req.headers.get("x-forwarded-for"),
      "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
    },
  }));

  // 1) Token guard
  if (!token || token.length < 16) {
    console.warn("Rejected: missing or invalid token");
    return sayAndHangup("This service is not configured. Goodbye.");
  }

  // Test mode — bypasses token→workspace lookup but still logs the call and
  // resolves the assigned agent. Use this to confirm Exotel reaches the webhook
  // without needing a connected exotel_accounts row.
  // Usage: GET/POST .../exotel-incoming-call?token=<any-16+chars>&test=1
  if (testMode) {
    // Body already captured above; re-use it (works for both GET query & POST body)
    const bodyPayload: Record<string, string> = parsedBody;
    const get = (k: string) => bodyPayload[k] ?? url.searchParams.get(k) ?? null;
    const callSid = get("CallSid") || get("call_sid");
    const fromNumber = get("From") || get("from") || get("CallFrom");
    const toNumber = get("To") || get("to") || get("CallTo") || get("DialWhomNumber");

    console.log(JSON.stringify({
      evt: "webhook_trigger",
      mode: "test",
      from: fromNumber, to: toNumber, call_sid: callSid, ip: clientIp,
    }));

    // Best-effort: log to DB and resolve assigned agent's welcome message
    let greeting = "Hello, this is a test AI agent. How can I help you?";
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

      let agentId: string | null = null;
      let phoneNumberId: string | null = null;
      let teamId: string | null = null;

      if (toNumber) {
        const candidates = [
          toNumber,
          toNumber.replace(/^\+/, ""),
          `+${toNumber.replace(/^\+/, "")}`,
          toNumber.replace(/^0/, "+91"),
          toNumber.replace(/^0/, "91"),
        ];
        const { data: pn } = await admin
          .from("phone_numbers")
          .select("id, team_id, agent_id, agents(name, welcome_message)")
          .in("phone_number", candidates)
          .maybeSingle();
        if (pn) {
          phoneNumberId = pn.id;
          teamId = pn.team_id;
          agentId = pn.agent_id;
          const agent = (pn as any).agents;
          if (agent?.welcome_message) greeting = agent.welcome_message;
          console.log(JSON.stringify({ evt: "agent_selected", agent_id: agentId, agent_name: agent?.name ?? null, phone_number_id: phoneNumberId }));
        } else {
          console.warn(JSON.stringify({ evt: "agent_not_found", to: toNumber }));
        }
      }

      if (teamId) {
        const { error: logErr } = await admin.from("calls").insert({
          team_id: teamId,
          agent_id: agentId,
          phone_number_id: phoneNumberId,
          provider: "exotel",
          call_sid: callSid,
          direction: "inbound",
          from_number: fromNumber,
          to_number: toNumber,
          status: agentId ? "test-answered" : "no-agent",
          answered_at: new Date().toISOString(),
          metadata: { mode: "test", payload: bodyPayload, query: Object.fromEntries(url.searchParams) },
        });
        if (logErr) console.error("test-mode call log failed:", logErr.message);
      } else {
        console.warn(JSON.stringify({ evt: "skip_call_log", reason: "no_team_resolved" }));
      }
    } catch (e) {
      console.error("test-mode side-effects error:", e);
    }

    const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="female">${escapeXml(greeting)}</Say>
  <Hangup/>
</Response>`;
    return xml(responseXml, 200, { mode: "test", greeting, elapsed_ms: Date.now() - startedAt });
  }

  // 2) Optional IP allowlist
  if (!isAllowedIp(clientIp)) {
    console.warn(`Rejected: IP ${clientIp} not in allowlist`);
    return sayAndHangup("Service unavailable. Goodbye.");
  }

  try {
    // 3) Parse Exotel webhook (form-encoded for POST, query for GET)
    let payload: Record<string, string> = {};
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        payload = Object.fromEntries(new URLSearchParams(text));
      } else if (ct.includes("application/json")) {
        payload = await req.json().catch(() => ({}));
      }
    }
    // Merge in query params (Exotel sends some via query)
    url.searchParams.forEach((v, k) => {
      if (k !== "token" && !(k in payload)) payload[k] = v;
    });

    const callSid = payload.CallSid || payload.call_sid || null;
    const fromNumber = payload.From || payload.from || payload.CallFrom || null;
    const toNumber = payload.To || payload.to || payload.CallTo || payload.DialWhomNumber || null;

    if (!toNumber) {
      console.warn("Rejected: no To number in payload", payload);
      return sayAndHangup("Sorry, we could not determine the number called. Goodbye.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 4) Validate token → resolves workspace
    const { data: acct, error: acctErr } = await admin
      .from("exotel_accounts")
      .select("id, team_id, account_sid")
      .eq("webhook_token", token)
      .maybeSingle();

    if (acctErr || !acct) {
      console.warn("Rejected: token did not match any exotel_account");
      return sayAndHangup("This service is not configured. Goodbye.");
    }

    // 5) Find phone_number row + assigned agent (scoped to this team)
    // Normalize: try exact match, then with/without leading '+'
    const candidates = [toNumber, toNumber.replace(/^\+/, ""), `+${toNumber.replace(/^\+/, "")}`];
    const { data: pn } = await admin
      .from("phone_numbers")
      .select("id, phone_number, agent_id")
      .eq("team_id", acct.team_id)
      .in("phone_number", candidates)
      .maybeSingle();

    // Best-effort call log (don't block on failure)
    const logCall = async (extra: Record<string, unknown>) => {
      const { error } = await admin.from("calls").insert({
        team_id: acct.team_id,
        agent_id: pn?.agent_id ?? null,
        phone_number_id: pn?.id ?? null,
        provider: "exotel",
        call_sid: callSid,
        direction: "inbound",
        from_number: fromNumber,
        to_number: toNumber,
        ...extra,
      });
      if (error) console.error("Failed to log call:", error.message);
    };

    if (!pn) {
      console.warn(`No phone_number row for to=${toNumber} in team=${acct.team_id}`);
      await logCall({ status: "no-agent", metadata: { reason: "number_not_imported", payload } });
      return sayAndHangup(
        "Sorry, this number is not configured. Please try again later. Goodbye.",
      );
    }

    if (!pn.agent_id) {
      // Forward to fallback_number if set, else hangup
      const { data: team } = await admin
        .from("teams")
        .select("fallback_number")
        .eq("id", acct.team_id)
        .maybeSingle();

      if (team?.fallback_number) {
        await logCall({ status: "forwarded", metadata: { to: team.fallback_number, payload } });
        const elapsed = Date.now() - startedAt;
        console.log(`Forwarded unassigned call in ${elapsed}ms`);
        return xml(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${escapeXml(team.fallback_number)}</Dial>
</Response>`,
        );
      }

      await logCall({ status: "no-agent", metadata: { reason: "no_agent_no_fallback", payload } });
      return sayAndHangup("No agent is available right now. Please try again later. Goodbye.");
    }

    // 6) Agent assigned → connect to streaming voicebot.
    // voice-stream is provider-agnostic; we pass ?provider=exotel so its
    // adapter knows how to parse/format frames.
    const wsUrl =
      `${SUPABASE_URL.replace(/^https?:/, "wss:")}/functions/v1/voice-stream` +
      `?provider=exotel&agent_id=${pn.agent_id}` +
      `&call_sid=${encodeURIComponent(callSid ?? "")}`;

    await logCall({
      status: "in-progress",
      answered_at: new Date().toISOString(),
      metadata: { ws_url: wsUrl, payload },
    });

    const elapsed = Date.now() - startedAt;
    console.log(`Routed call to agent ${pn.agent_id} in ${elapsed}ms`);

    return xml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Voicebot url="${escapeXml(wsUrl)}" />
  </Connect>
</Response>`,
    );
  } catch (e) {
    console.error("incoming-call handler error:", e);
    // Always return valid ExoML, never a 500 — Exotel will hang up on bad XML
    return sayAndHangup("An unexpected error occurred. Please try again later. Goodbye.");
  }
});
