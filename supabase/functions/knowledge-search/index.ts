import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { query, knowledgeBaseIds, matchCount = 5, matchThreshold = 0.5 } = await req.json();
    if (!query || !knowledgeBaseIds?.length) {
      return new Response(JSON.stringify({ error: "query and knowledgeBaseIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for the query
    const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: query,
        dimensions: 768,
      }),
    });

    if (!embResp.ok) throw new Error(`Embedding failed: ${embResp.status}`);
    const embData = await embResp.json();
    const queryEmbedding = embData.data[0].embedding;

    // Search using the database function
    const { data, error } = await supabase.rpc("search_knowledge_chunks", {
      _query_embedding: JSON.stringify(queryEmbedding),
      _knowledge_base_ids: knowledgeBaseIds,
      _match_count: matchCount,
      _match_threshold: matchThreshold,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ results: data || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("knowledge-search error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
