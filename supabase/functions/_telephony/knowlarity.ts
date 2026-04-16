// Knowlarity adapter — STUB implementation, conforms to TelephonyProvider.
// Knowlarity Super Receptionist API uses JSON + x-api-key header.
// Docs: https://kpidocs.knowlarity.com/
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const KNOWLARITY_BASE = "https://kpi.knowlarity.com";

export const knowlarityAdapter: TelephonyProvider = {
  id: "knowlarity",
  displayName: "Knowlarity",

  async validateCredentials(creds) {
    // Knowlarity uses x-api-key + Authorization (sr_token).
    // account_sid → SR number, api_key → x-api-key, api_token → SR auth token.
    if (!creds.api_key || !creds.api_token) {
      return { ok: false, error: "Knowlarity x-api-key and SR auth token are required." };
    }
    try {
      const r = await fetch(`${KNOWLARITY_BASE}/Basic/v1/account/calllog?limit=1`, {
        headers: {
          "x-api-key": creds.api_key,
          Authorization: creds.api_token,
        },
      });
      if (r.ok || r.status === 200) return { ok: true };
      if (r.status === 401 || r.status === 403)
        return { ok: false, error: "Invalid Knowlarity credentials." };
      return { ok: false, error: `Knowlarity rejected the request (HTTP ${r.status}).` };
    } catch {
      return { ok: false, error: "Could not reach Knowlarity API." };
    }
  },

  async listNumbers(creds): Promise<NormalizedNumber[]> {
    // Knowlarity does not expose a public "list numbers" endpoint in the same way.
    // Numbers are typically provisioned via account manager and visible in the dashboard.
    // Return the configured SR number from creds.account_sid as the primary number.
    if (!creds.account_sid) return [];
    return [
      {
        phone_number: creds.account_sid,
        friendly_name: "Knowlarity SR Number",
        status: "active",
        provider_number_id: creds.account_sid,
      },
    ];
  },

  parseIncomingWebhook(_req, body): IncomingCallPayload {
    // Knowlarity webhook fields: call_id, caller_number, called_number, dialed_number
    return {
      call_sid: body.call_id || body.uuid || null,
      from_number: body.caller_number || body.caller_id || null,
      to_number: body.called_number || body.dialed_number || body.k_number || null,
      raw: body,
    };
  },

  renderControlResponse(action: CallControlResponse): Response {
    // Knowlarity uses JSON-based call control via API callbacks ("dispatcher" pattern).
    // We respond with a JSON instruction the Knowlarity dispatcher understands.
    if (action.kind === "stream") {
      return jsonResponse({ action: "stream", url: action.ws_url });
    }
    if (action.kind === "forward") {
      return jsonResponse({ action: "transfer", number: action.number });
    }
    return jsonResponse({ action: "hangup", message: action.message });
  },

  async placeOutboundCall(
    creds: ProviderCredentials,
    req: OutboundCallRequest,
    _callbacks,
  ): Promise<OutboundCallResult> {
    // Knowlarity click-to-call: POST /Basic/v1/account/call/makecall
    const r = await fetch(`${KNOWLARITY_BASE}/Basic/v1/account/call/makecall`, {
      method: "POST",
      headers: {
        "x-api-key": creds.api_key,
        Authorization: creds.api_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        k_number: req.from,
        agent_number: req.caller_id || req.from,
        customer_number: req.to,
        caller_id: req.caller_id || req.from,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Knowlarity outbound error (${r.status}): ${JSON.stringify(data)}`);
    return {
      call_sid: data?.success?.call_id || data?.call_id || "",
      status: data?.success ? "queued" : "failed",
    };
  },
};
