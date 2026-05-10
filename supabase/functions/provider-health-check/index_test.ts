// Integration test: provider-health-check function returns probes array.
// Run via the supabase test_edge_functions tool.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("provider-health-check responds with probes", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-health-check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  });
  const body = await res.json();
  assert(res.ok, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert(Array.isArray(body.probes), "probes should be an array");
  assert(body.probes.length >= 4, "should probe at least 4 providers");
  for (const p of body.probes) {
    assert(typeof p.provider === "string");
    assert(["ok", "degraded", "down", "unknown"].includes(p.status));
  }
});

Deno.test("provider-health-check responds to OPTIONS preflight", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-health-check`, {
    method: "OPTIONS",
  });
  await res.text();
  assertEquals(res.status, 200);
});
