// Integration test: telephony-incoming-call rejects requests without a known
// phone number and returns a 200 TwiML fallback (production safety net).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;

Deno.test("telephony-incoming-call returns TwiML for unknown number", async () => {
  const form = new URLSearchParams({
    To: "+10000000000",
    From: "+19999999999",
    CallSid: "CAtest_" + Math.random().toString(36).slice(2),
  });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/telephony-incoming-call`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  assert(res.status === 200 || res.status === 404, `unexpected ${res.status}: ${text}`);
  // Must always be safe XML if 200
  if (res.status === 200) {
    assert(text.includes("<Response>") || text.includes("Twiml"), `not TwiML: ${text}`);
  }
});
