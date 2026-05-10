// Telephony provider abstraction — standard interface implemented by every provider.
// Adding a new provider = create a new adapter file that implements TelephonyProvider
// and register it in registry.ts. No call-routing or UI code needs to change.

export type ProviderId = "knowlarity" | "twilio";

export interface ProviderCredentials {
  account_sid: string;
  api_key: string;
  api_token: string;
  subdomain?: string;
  // Provider-specific extras land in `extra` (kept opaque to callers).
  extra?: Record<string, string>;
}

export interface NormalizedNumber {
  phone_number: string;       // E.164 if possible
  friendly_name?: string;
  status: "active" | "inactive" | "pending";
  provider_number_id: string; // SID/UUID from provider
}

export interface IncomingCallPayload {
  call_sid: string | null;
  from_number: string | null;
  to_number: string | null;
  raw: Record<string, unknown>;
}

export type CallControlResponse =
  | { kind: "stream"; ws_url: string }
  | { kind: "forward"; number: string }
  | { kind: "say_hangup"; message: string };

export interface OutboundCallRequest {
  from: string;          // your provider number
  to: string;            // destination
  agent_id?: string;     // for stream-back routing
  caller_id?: string;
}

export interface OutboundCallResult {
  call_sid: string;
  status: string;
}

/**
 * Standard telephony provider interface.
 * All future providers (Knowlarity, Twilio, Plivo…) must conform.
 */
export interface TelephonyProvider {
  readonly id: ProviderId;
  readonly displayName: string;

  // ─── Connection / credential validation ───
  validateCredentials(creds: ProviderCredentials): Promise<{ ok: true } | { ok: false; error: string }>;

  // ─── Number management ───
  listNumbers(creds: ProviderCredentials): Promise<NormalizedNumber[]>;
  purchaseNumber?(
    creds: ProviderCredentials,
    phone_number: string,
  ): Promise<{ provider_number_id: string; status: string }>;

  // ─── Incoming call handling ───
  /** Parse a webhook request body/headers into a normalized payload. */
  parseIncomingWebhook(req: Request, body: Record<string, string>): IncomingCallPayload;
  /** Render the provider-specific control response (XML/JSON) for an incoming call. */
  renderControlResponse(action: CallControlResponse): Response;

  // ─── Outgoing call handling ───
  placeOutboundCall?(
    creds: ProviderCredentials,
    req: OutboundCallRequest,
    callbacks: { stream_ws_url: string; status_callback_url: string },
  ): Promise<OutboundCallResult>;
}
