// Twilio adapter — implements TelephonyProvider for Twilio Programmable Voice.
// Twilio webhook is form-encoded: From, To, CallSid.
// Control response is TwiML XML. For media streaming we use <Connect><Stream/>.
import type {
  CallControlResponse,
  IncomingCallPayload,
  NormalizedNumber,
  OutboundCallRequest,
  OutboundCallResult,
  ProviderCredentials,
  TelephonyProvider,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
  });
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

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

export const twilioAdapter: TelephonyProvider = {
  id: "twilio" as any, // extend ProviderId union below
  displayName: "Twilio",

  async validateCredentials(_creds) {
    try {
      const r = await gatewayFetch("/IncomingPhoneNumbers.json?PageSize=1");
      if (r.ok) return { ok: true };
      return { ok: false, error: `Twilio rejected the request (HTTP ${r.status}).` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async listNumbers(_creds): Promise<NormalizedNumber[]> {
    const r = await gatewayFetch("/IncomingPhoneNumbers.json?PageSize=1000");
    if (!r.ok) throw new Error(`Twilio API error (${r.status})`);
    const data = await r.json();
    const list = data?.incoming_phone_numbers || [];
    return list.map((n: any) => ({
      phone_number: n.phone_number,
      friendly_name: n.friendly_name || "",
      status: "active" as const,
      provider_number_id: n.sid,
    }));
  },

  parseIncomingWebhook(_req, body): IncomingCallPayload {
    return {
      call_sid: body.CallSid || null,
      from_number: body.From || body.Caller || null,
      to_number: body.To || body.Called || null,
      raw: body,
    };
  },

  renderControlResponse(action: CallControlResponse): Response {
    if (action.kind === "stream") {
      // Twilio Media Streams: <Connect><Stream url="wss://..."/></Connect>
      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(action.ws_url)}" />
  </Connect>
</Response>`,
      );
    }
    if (action.kind === "forward") {
      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${escapeXml(action.number)}</Dial>
</Response>`,
      );
    }
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(action.message)}</Say>
  <Hangup/>
</Response>`,
    );
  },

  async placeOutboundCall(
    _creds: ProviderCredentials,
    req: OutboundCallRequest,
    callbacks,
  ): Promise<OutboundCallResult> {
    const form = new URLSearchParams();
    form.set("To", req.to);
    form.set("From", req.caller_id || req.from);
    form.set("Url", callbacks.stream_ws_url.replace(/^wss:/, "https:"));
    form.set("StatusCallback", callbacks.status_callback_url);
    const r = await gatewayFetch("/Calls.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Twilio outbound error (${r.status}): ${JSON.stringify(data)}`);
    return { call_sid: data?.sid || "", status: data?.status || "queued" };
  },
};
