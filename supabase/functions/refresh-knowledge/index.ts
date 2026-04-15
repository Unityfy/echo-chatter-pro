import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find URL sources with auto_refresh enabled and stale (>24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleSources, error } = await supabase
      .from("knowledge_sources")
      .select("id, source_url, crawl_config, parent_source_id")
      .eq("type", "url")
      .is("parent_source_id", null)
      .or(`last_refreshed_at.is.null,last_refreshed_at.lt.${cutoff}`);

    if (error) throw error;

    // Filter to only those with auto_refresh enabled
    const toRefresh = (staleSources || []).filter(
      (s: any) => s.crawl_config?.auto_refresh === true
    );

    if (toRefresh.length === 0) {
      return new Response(JSON.stringify({ message: "No sources need refresh", refreshed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger crawl for each stale source
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let refreshed = 0;

    for (const source of toRefresh) {
      try {
        const crawlMode = source.crawl_config?.auto_crawl === true;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/crawl-knowledge`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            sourceId: source.id,
            mode: crawlMode ? "crawl" : "single",
          }),
        });
        if (resp.ok) refreshed++;
        await resp.text(); // consume body
      } catch (e) {
        console.error(`Refresh failed for ${source.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ refreshed, total: toRefresh.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
