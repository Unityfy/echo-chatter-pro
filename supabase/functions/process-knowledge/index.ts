import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + CHUNK_SIZE >= words.length) break;
  }
  return chunks.length ? chunks : [text.trim()];
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 768,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding failed: ${resp.status} ${err}`);
  }
  const data = await resp.json();
  return data.data[0].embedding;
}

async function fetchUrlContent(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
  const html = await resp.text();
  // Simple HTML to text extraction
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { sourceId } = await req.json();
    if (!sourceId) throw new Error("sourceId is required");

    // Get source
    const { data: source, error: srcErr } = await supabase
      .from("knowledge_sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    if (srcErr || !source) throw new Error("Source not found");

    // Update status to processing
    await supabase.from("knowledge_sources").update({ status: "processing" }).eq("id", sourceId);

    let content = "";
    if (source.type === "text") {
      content = source.content_text || "";
    } else if (source.type === "url") {
      content = await fetchUrlContent(source.source_url);
    } else if (source.type === "file") {
      content = source.content_text || "";
    }

    if (!content.trim()) {
      await supabase.from("knowledge_sources").update({ status: "error", error_message: "No content to process" }).eq("id", sourceId);
      return new Response(JSON.stringify({ error: "No content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing chunks for this source
    await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);

    // Chunk the content
    const chunks = chunkText(content);

    // Generate embeddings and insert chunks
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i], LOVABLE_API_KEY);
        const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
          source_id: sourceId,
          content: chunks[i],
          embedding: JSON.stringify(embedding),
          chunk_index: i,
          metadata: { source_type: source.type, source_name: source.file_name || source.source_url || "text" },
        });
        if (!insertErr) successCount++;
      } catch (e) {
        console.error(`Chunk ${i} failed:`, e);
      }
    }

    // Update source status
    await supabase.from("knowledge_sources").update({
      status: "ready",
      chunk_count: successCount,
      error_message: null,
    }).eq("id", sourceId);

    return new Response(JSON.stringify({ success: true, chunks: successCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
