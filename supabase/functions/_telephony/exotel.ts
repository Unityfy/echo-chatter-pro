// Exotel adapter — implements TelephonyProvider for Exotel.
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

function basicAuth(key: string, token: string) {
  return "Basic " + btoa(`${key}:${token}`);
}

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

export const exotelAdapter: TelephonyProvider = {
  id: "exotel",
  displayName: "Exotel",

  async validateCredentials(creds) {
    const subdomain = creds.subdomain || "api.exotel.com";
    try {
      const r = await fetch(`https://${subdomain}/v1/Accounts/${creds.account_sid}.json`, {
        headers: { Authorization: basicAuth(creds.api_key, creds.api_token) },
      });
      if (r.ok) return { ok: true };
      if (r.status === 401 || r.status === 403)
        return { ok: false, error: "Invalid Exotel credentials. Check your Account SID, API Key, and Token." };
      if (r.status === 404)
        return { ok: false, error: "Exotel account not found. Verify your Account SID and subdomain." };
      return { ok: false, error: `Exotel rejected the request (HTTP ${r.status}).` };
    } catch {
      return { ok: false, error: "Could not reach Exotel. Check your subdomain and try again." };
    }
  },

  async listNumbers(creds): Promise<NormalizedNumber[]> {
    const subdomain = creds.subdomain || "api.exotel.com";
    const url = `https://${subdomain}/v1/Accounts/${creds.account_sid}/IncomingPhoneNumbers.json`;
    const r = await fetch(url, { headers: { Authorization: basicAuth(creds.api_key, creds.api_token) } });
    if (!r.ok) throw new Error(`Exotel API error (${r.status})`);
    const data = await r.json();
    const list = data?.IncomingPhoneNumbers || data?.incoming_phone_numbers || [];
    return list
      .map((n: any) => ({
        phone_number: n.PhoneNumber || n.phone_number,
        friendly_name: n.FriendlyName || n.friendly_name || "",
        status: ((n.Status || n.status || "active").toLowerCase() === "active"
          ? "active"
          : "inactive") as NormalizedNumber["status"],
        provider_number_id: n.Sid || n.sid || "",
      }))
      .filter((n: NormalizedNumber) => !!n.phone_number);
  },

  parseIncomingWebhook(_req, body): IncomingCallPayload {
    return {
      call_sid: body.CallSid || body.call_sid || null,
      from_number: body.From || body.from || body.CallFrom || null,
      to_number: body.To || body.to || body.CallTo || body.DialWhomNumber || null,
      raw: body,
    };
  },

  renderControlResponse(action: CallControlResponse): Response {
    if (action.kind === "stream") {
      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Voicebot url="${escapeXml(action.ws_url)}" />
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
  <Say voice="female">${escapeXml(action.message)}</Say>
  <Hangup/>
</Response>`,
    );
  },

  async placeOutboundCall(
    creds: ProviderCredentials,
    req: OutboundCallRequest,
    callbacks,
  ): Promise<OutboundCallResult> {
    const subdomain = creds.subdomain || "api.exotel.com";
    const url = `https://${subdomain}/v1/Accounts/${creds.account_sid}/Calls/connect.json`;
    const form = new URLSearchParams();
    form.set("From", req.to); // Exotel: From=customer, To=your-app/agent
    form.set("CallerId", req.caller_id || req.from);
    form.set("Url", callbacks.stream_ws_url.replace(/^wss:/, "https:"));
    form.set("StatusCallback", callbacks.status_callback_url);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuth(creds.api_key, creds.api_token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Exotel outbound error (${r.status}): ${JSON.stringify(data)}`);
    return {
      call_sid: data?.Call?.Sid || data?.call?.sid || "",
      status: data?.Call?.Status || data?.call?.status || "queued",
    };
  },
};
