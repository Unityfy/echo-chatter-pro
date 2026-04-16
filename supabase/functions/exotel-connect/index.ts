import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function basicAuth(key: string, token: string) {
  return "Basic " + btoa(`${key}:${token}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ENC_KEY = Deno.env.get("EXOTEL_ENCRYPTION_KEY");
    if (!ENC_KEY) return json({ error: "Encryption key not configured" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // Resolve team
    const { data: tm } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const teamId = tm?.team_id;
    if (!teamId) return json({ error: "No workspace found" }, 400);

    // ─── CONNECT: validate creds, encrypt, store ───
    if (action === "connect") {
      const sid = (body.account_sid as string)?.trim();
      const apiKey = (body.api_key as string)?.trim();
      const apiToken = (body.api_token as string)?.trim();
      const subdomain = (body.subdomain as string)?.trim() || "api.exotel.com";

      // Input validation
      if (!sid || !apiKey || !apiToken)
        return json({ error: "account_sid, api_key, and api_token are required" }, 400);
      if (sid.length < 3 || sid.length > 100)
        return json({ error: "account_sid has invalid length" }, 400);
      if (apiKey.length < 10 || apiKey.length > 200)
        return json({ error: "api_key has invalid length" }, 400);
      if (apiToken.length < 10 || apiToken.length > 200)
        return json({ error: "api_token has invalid length" }, 400);
      if (!/^[a-zA-Z0-9_-]+$/.test(sid))
        return json({ error: "account_sid contains invalid characters" }, 400);
      if (!/^[a-zA-Z0-9.-]+$/.test(subdomain))
        return json({ error: "subdomain has invalid format" }, 400);

      // Validate credentials by calling Exotel — return user-safe error messages
      try {
        const r = await fetch(
          `https://${subdomain}/v1/Accounts/${sid}.json`,
          { headers: { Authorization: basicAuth(apiKey, apiToken) } },
        );
        if (!r.ok) {
          if (r.status === 401 || r.status === 403)
            return json({ error: "Invalid Exotel credentials. Check your Account SID, API Key, and Token." }, 400);
          if (r.status === 404)
            return json({ error: "Exotel account not found. Verify your Account SID and subdomain." }, 400);
          return json({ error: `Exotel rejected the request (HTTP ${r.status}). Please verify your credentials.` }, 400);
        }
      } catch (e) {
        console.error("Exotel validation network error:", e);
        return json({ error: "Could not reach Exotel. Check your subdomain and try again." }, 400);
      }

      // Encrypt & store via direct DB connection (pgp_sym_encrypt isn't exposed via PostgREST)
      const DB_URL = Deno.env.get("SUPABASE_DB_URL");
      if (!DB_URL) {
        console.error("SUPABASE_DB_URL not configured");
        return json({ error: "Server misconfigured" }, 500);
      }

      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client(DB_URL);
      try {
        await client.connect();
        const result = await client.queryObject<{
          id: string; account_sid: string; subdomain: string; status: string;
          last_validated_at: string; created_at: string;
        }>(
          `INSERT INTO public.exotel_accounts (team_id, created_by, account_sid, subdomain, api_key_encrypted, api_token_encrypted, status, last_validated_at)
           VALUES ($1, $2, $3, $4,
             pgp_sym_encrypt($5, $6),
             pgp_sym_encrypt($7, $8),
             'connected', now())
           ON CONFLICT (team_id, account_sid) DO UPDATE SET
             api_key_encrypted = pgp_sym_encrypt($5, $6),
             api_token_encrypted = pgp_sym_encrypt($7, $8),
             subdomain = $4,
             status = 'connected',
             last_validated_at = now(),
             updated_at = now()
           RETURNING id, account_sid, subdomain, status, last_validated_at, created_at`,
          [teamId, userId, sid, subdomain, apiKey, ENC_KEY, apiToken, ENC_KEY],
        );
        const row = result.rows[0];
        // Return only metadata + masked previews — never the raw secrets
        return json({
          account: {
            ...row,
            api_key_last4: apiKey.slice(-4),
            api_token_last4: apiToken.slice(-4),
          },
        });
      } catch (e) {
        console.error("DB insert error:", e);
        return json({ error: "Failed to store credentials securely" }, 500);
      } finally {
        await client.end().catch(() => {});
      }
    }

    // ─── LIST_NUMBERS: fetch numbers from user's Exotel account ───
    if (action === "list_numbers") {
      const accountId = body.account_id as string;
      if (!accountId) return json({ error: "account_id required" }, 400);

      const DB_URL = Deno.env.get("SUPABASE_DB_URL");
      if (!DB_URL) return json({ error: "DB URL not configured" }, 500);

      const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
      const client = new Client(DB_URL);
      await client.connect();
      let acct: any;
      try {
        const res = await client.queryObject(
          `SELECT id, account_sid, subdomain,
             pgp_sym_decrypt(api_key_encrypted, $1) as api_key,
             pgp_sym_decrypt(api_token_encrypted, $1) as api_token
           FROM public.exotel_accounts
           WHERE id = $2 AND team_id = $3`,
          [ENC_KEY, accountId, teamId],
        );
        await client.end();
        if (res.rows.length === 0) return json({ error: "Account not found" }, 404);
        acct = res.rows[0];
      } catch (e) {
        await client.end().catch(() => {});
        return json({ error: (e as Error).message }, 500);
      }

      // Fetch numbers from Exotel
      try {
        const url = `https://${acct.subdomain}/v1/Accounts/${acct.account_sid}/IncomingPhoneNumbers.json`;
        const r = await fetch(url, {
          headers: { Authorization: basicAuth(acct.api_key, acct.api_token) },
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          return json({ error: `Exotel API error (${r.status}): ${t}` }, 400);
        }
        const data = await r.json();
        const list = data?.IncomingPhoneNumbers || data?.incoming_phone_numbers || [];
        const numbers = list.map((n: any) => ({
          phone_number: n.PhoneNumber || n.phone_number,
          friendly_name: n.FriendlyName || n.friendly_name || "",
          status: (n.Status || n.status || "active").toLowerCase(),
          sid: n.Sid || n.sid || "",
        }));
        return json({ numbers });
      } catch (e) {
        return json({ error: `Exotel fetch failed: ${(e as Error).message}` }, 500);
      }
    }

    // ─── IMPORT_NUMBERS: save selected numbers to phone_numbers table ───
    if (action === "import_numbers") {
      const accountId = body.account_id as string;
      const selected = body.numbers as { phone_number: string; sid: string }[];
      if (!accountId || !selected?.length) return json({ error: "account_id and numbers[] required" }, 400);

      const rows = selected.map((n) => ({
        team_id: teamId,
        phone_number: n.phone_number,
        provider: "exotel",
        provider_number_id: n.sid || null,
        status: "active",
        exotel_account_id: accountId,
      }));

      const { data, error } = await admin.from("phone_numbers").insert(rows).select();
      if (error) return json({ error: error.message }, 400);
      return json({ imported: data });
    }

    // ─── DISCONNECT: remove account (cascade will nullify phone_numbers FK) ───
    if (action === "disconnect") {
      const accountId = body.account_id as string;
      if (!accountId) return json({ error: "account_id required" }, 400);

      const { error } = await admin
        .from("exotel_accounts")
        .delete()
        .eq("id", accountId)
        .eq("team_id", teamId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ─── STATUS: get connected accounts for this team ───
    if (action === "status") {
      const { data, error } = await admin
        .from("exotel_accounts")
        .select("id, account_sid, subdomain, status, last_validated_at, created_at")
        .eq("team_id", teamId);
      if (error) return json({ error: error.message }, 400);
      return json({ accounts: data ?? [] });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("exotel-connect error:", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
